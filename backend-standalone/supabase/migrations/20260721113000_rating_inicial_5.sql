-- MOVVI: motorista e passageiro iniciam com nota publica 5,0.
-- A partir da primeira avaliacao, a nota passa a ser a media apenas das
-- avaliacoes reais (o 5,0 inicial nao entra como voto ficticio).

BEGIN;

ALTER TABLE public.drivers
  ALTER COLUMN rating SET DEFAULT 5.00,
  ALTER COLUMN average_rating SET DEFAULT 5.00;

ALTER TABLE public.users
  ALTER COLUMN average_rating SET DEFAULT 5.00;

-- Corrige somente perfis sem nenhuma avaliacao. Perfis ja avaliados mantem
-- exatamente a media real que possuem hoje.
UPDATE public.drivers
   SET rating = 5.00,
       average_rating = 5.00,
       updated_at = now()
 WHERE COALESCE(total_ratings, 0) = 0
   AND (rating IS DISTINCT FROM 5.00 OR average_rating IS DISTINCT FROM 5.00);

UPDATE public.users
   SET average_rating = 5.00,
       updated_at = now()
 WHERE COALESCE(total_ratings, 0) = 0
   AND average_rating IS DISTINCT FROM 5.00;

CREATE OR REPLACE FUNCTION public.recompute_driver_rating(_driver_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avg numeric;
  v_total integer;
  v_public_rating numeric;
BEGIN
  SELECT AVG(driver_rating)::numeric, COUNT(*)::integer
    INTO v_avg, v_total
    FROM public.ride_ratings
   WHERE driver_id = _driver_id
     AND driver_rating IS NOT NULL;

  v_public_rating := CASE
    WHEN v_total = 0 THEN 5.00
    ELSE ROUND(v_avg, 2)
  END;

  UPDATE public.drivers
     SET average_rating = v_public_rating,
         total_ratings = v_total,
         rating = v_public_rating,
         updated_at = now()
   WHERE user_id = _driver_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_passenger_rating(_passenger_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avg numeric;
  v_total integer;
  v_public_rating numeric;
BEGIN
  SELECT AVG(passenger_rating)::numeric, COUNT(*)::integer
    INTO v_avg, v_total
    FROM public.ride_ratings
   WHERE passenger_id = _passenger_id
     AND passenger_rating IS NOT NULL;

  v_public_rating := CASE
    WHEN v_total = 0 THEN 5.00
    ELSE ROUND(v_avg, 2)
  END;

  UPDATE public.users
     SET average_rating = v_public_rating,
         total_ratings = v_total,
         updated_at = now()
   WHERE auth_user_id = _passenger_id;
END;
$$;

-- O painel inicial do motorista calculava 0 quando ainda nao havia notas.
CREATE OR REPLACE FUNCTION public.get_driver_home_kpis(_user_id uuid)
RETURNS TABLE(
  earnings_today numeric,
  trips_today bigint,
  distance_today numeric,
  rating numeric,
  total_trips bigint,
  acceptance_rate numeric,
  cancellation_rate numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  day_start timestamptz := date_trunc('day', now());
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() <> _user_id AND NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE((SELECT SUM(final_price) FROM rides WHERE driver_id = _user_id AND status = 'finalizada' AND completed_at >= day_start), 0)::numeric,
    COALESCE((SELECT COUNT(*) FROM rides WHERE driver_id = _user_id AND status = 'finalizada' AND completed_at >= day_start), 0)::bigint,
    COALESCE((SELECT SUM(distance_km) FROM rides WHERE driver_id = _user_id AND status = 'finalizada' AND completed_at >= day_start), 0)::numeric,
    COALESCE((SELECT AVG(driver_rating) FROM rides WHERE driver_id = _user_id AND driver_rating IS NOT NULL), 5.00)::numeric,
    COALESCE((SELECT COUNT(*) FROM rides WHERE driver_id = _user_id AND status = 'finalizada'), 0)::bigint,
    CASE
      WHEN (SELECT COUNT(*) FROM rides WHERE driver_id = _user_id) = 0 THEN 0
      ELSE (SELECT COUNT(*)::numeric FROM rides WHERE driver_id = _user_id AND status NOT IN ('cancelada_motorista'))
        / NULLIF((SELECT COUNT(*) FROM rides WHERE driver_id = _user_id), 0)
    END,
    CASE
      WHEN (SELECT COUNT(*) FROM rides WHERE driver_id = _user_id) = 0 THEN 0
      ELSE (SELECT COUNT(*)::numeric FROM rides WHERE driver_id = _user_id AND status::text LIKE 'cancelada%')
        / NULLIF((SELECT COUNT(*) FROM rides WHERE driver_id = _user_id), 0)
    END;
END;
$function$;

-- O perfil do passageiro tambem deve mostrar 5,0 antes da primeira nota.
CREATE OR REPLACE FUNCTION public.get_passenger_stats(_user_id uuid)
RETURNS TABLE(
  total_rides bigint,
  completed_rides bigint,
  cancelled_rides bigint,
  total_spent numeric,
  avg_rating numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() <> _user_id AND NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT
      COUNT(*) AS total_rides,
      COUNT(*) FILTER (WHERE status::text = 'finalizada') AS completed_rides,
      COUNT(*) FILTER (WHERE status::text LIKE 'cancelada%') AS cancelled_rides,
      COALESCE(SUM(final_price) FILTER (WHERE status::text = 'finalizada'), 0) AS total_spent,
      COALESCE(AVG(passenger_rating) FILTER (WHERE passenger_rating IS NOT NULL), 5.00) AS avg_rating
    FROM public.rides
    WHERE passenger_id = _user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.recompute_driver_rating(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_passenger_rating(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_driver_rating(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recompute_passenger_rating(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_driver_home_kpis(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_passenger_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_driver_home_kpis(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_passenger_stats(uuid) TO authenticated, service_role;

COMMIT;
