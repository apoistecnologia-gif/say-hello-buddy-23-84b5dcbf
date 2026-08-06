-- APOIS Passageiro — avaliação do motorista e compartilhamento protegido da corrida
-- Migração aditiva, idempotente e sem exposição de dados pessoais do passageiro.

BEGIN;

ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS passenger_rating numeric(2,1),
  ADD COLUMN IF NOT EXISTS passenger_rating_comment text,
  ADD COLUMN IF NOT EXISTS share_token text;

UPDATE public.rides
SET share_token = replace(gen_random_uuid()::text, '-', '')
WHERE share_token IS NULL OR btrim(share_token) = '';

ALTER TABLE public.rides
  ALTER COLUMN share_token SET DEFAULT replace(gen_random_uuid()::text, '-', '');

CREATE UNIQUE INDEX IF NOT EXISTS rides_share_token_unique
  ON public.rides(share_token)
  WHERE share_token IS NOT NULL;

DO $block$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rides_passenger_rating_range'
      AND conrelid = 'public.rides'::regclass
  ) THEN
    ALTER TABLE public.rides
      ADD CONSTRAINT rides_passenger_rating_range
      CHECK (passenger_rating IS NULL OR passenger_rating BETWEEN 1 AND 5);
  END IF;
END;
$block$;

CREATE OR REPLACE FUNCTION public.ensure_ride_share_token()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.share_token IS NULL OR btrim(NEW.share_token) = '' THEN
    NEW.share_token := replace(gen_random_uuid()::text, '-', '');
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS rides_ensure_share_token ON public.rides;
CREATE TRIGGER rides_ensure_share_token
BEFORE INSERT OR UPDATE OF share_token ON public.rides
FOR EACH ROW
EXECUTE FUNCTION public.ensure_ride_share_token();

CREATE OR REPLACE FUNCTION public.rate_passenger_ride(
  _ride_id uuid,
  _rating integer,
  _comment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _auth_user_id uuid := auth.uid();
  _passenger_id uuid;
  _ride public.rides%ROWTYPE;
  _driver public.drivers%ROWTYPE;
  _normalized_comment text;
  _average_rating numeric(4,2);
  _ratings_count integer;
BEGIN
  IF _auth_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF _rating IS NULL OR _rating < 1 OR _rating > 5 THEN
    RAISE EXCEPTION 'rating_out_of_range';
  END IF;

  SELECT id
  INTO _passenger_id
  FROM public.users
  WHERE auth_user_id = _auth_user_id OR id = _auth_user_id
  ORDER BY CASE WHEN auth_user_id = _auth_user_id THEN 0 ELSE 1 END
  LIMIT 1;

  IF _passenger_id IS NULL THEN
    RAISE EXCEPTION 'passenger_profile_missing';
  END IF;

  SELECT *
  INTO _ride
  FROM public.rides
  WHERE id = _ride_id
    AND passenger_id = _passenger_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ride_not_found';
  END IF;

  IF _ride.status <> 'finalizada' THEN
    RAISE EXCEPTION 'ride_not_completed';
  END IF;

  IF _ride.driver_id IS NULL THEN
    RAISE EXCEPTION 'ride_driver_missing';
  END IF;

  IF _ride.passenger_rating IS NOT NULL THEN
    RAISE EXCEPTION 'ride_already_rated';
  END IF;

  _normalized_comment := NULLIF(left(btrim(COALESCE(_comment, '')), 500), '');

  UPDATE public.rides
  SET passenger_rating = _rating,
      passenger_rating_comment = _normalized_comment,
      updated_at = now()
  WHERE id = _ride.id;

  SELECT *
  INTO _driver
  FROM public.drivers
  WHERE id = _ride.driver_id OR user_id = _ride.driver_id
  ORDER BY CASE WHEN id = _ride.driver_id THEN 0 ELSE 1 END
  LIMIT 1;

  IF FOUND THEN
    SELECT round(avg(r.passenger_rating)::numeric, 2), count(*)::integer
    INTO _average_rating, _ratings_count
    FROM public.rides r
    WHERE r.status = 'finalizada'
      AND r.passenger_rating IS NOT NULL
      AND (r.driver_id = _driver.id OR r.driver_id = _driver.user_id);

    UPDATE public.drivers
    SET rating = COALESCE(_average_rating, rating),
        updated_at = now()
    WHERE id = _driver.id;
  ELSE
    _average_rating := NULL;
    _ratings_count := 0;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'ride_id', _ride.id,
    'rating', _rating,
    'comment_saved', _normalized_comment IS NOT NULL,
    'driver_average_rating', _average_rating,
    'driver_ratings_count', COALESCE(_ratings_count, 0)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_shared_passenger_ride(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $function$
DECLARE
  _normalized_token text := btrim(COALESCE(_token, ''));
  _ride record;
BEGIN
  IF length(_normalized_token) < 16 OR length(_normalized_token) > 80 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT
    r.status,
    r.category,
    r.origin_name,
    r.destination_name,
    r.driver_name,
    r.driver_vehicle_model,
    r.driver_vehicle_color,
    r.driver_vehicle_plate,
    r.driver_latitude,
    r.driver_longitude,
    r.driver_heading,
    r.created_at,
    r.accepted_at,
    r.driver_arrived_at,
    r.started_at,
    r.completed_at,
    r.updated_at
  INTO _ride
  FROM public.rides r
  WHERE r.share_token = _normalized_token
    AND (
      r.status IN ('procurar_motorista', 'motorista_a_caminho', 'motorista_chegou', 'em_viagem')
      OR (
        r.status IN ('finalizada', 'cancelada_passageiro', 'cancelada_motorista')
        AND r.updated_at >= now() - interval '6 hours'
      )
    )
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'ride', jsonb_build_object(
      'status', _ride.status,
      'category', _ride.category,
      'origin_name', _ride.origin_name,
      'destination_name', _ride.destination_name,
      'driver_name', _ride.driver_name,
      'driver_vehicle_model', _ride.driver_vehicle_model,
      'driver_vehicle_color', _ride.driver_vehicle_color,
      'driver_vehicle_plate', _ride.driver_vehicle_plate,
      'driver_latitude', _ride.driver_latitude,
      'driver_longitude', _ride.driver_longitude,
      'driver_heading', _ride.driver_heading,
      'created_at', _ride.created_at,
      'accepted_at', _ride.accepted_at,
      'driver_arrived_at', _ride.driver_arrived_at,
      'started_at', _ride.started_at,
      'completed_at', _ride.completed_at,
      'updated_at', _ride.updated_at
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rate_passenger_ride(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rate_passenger_ride(uuid, integer, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_shared_passenger_ride(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_passenger_ride(text) TO anon, authenticated, service_role;

COMMIT;
