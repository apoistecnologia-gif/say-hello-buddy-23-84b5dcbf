-- APOIS Passageiro — avaliações reais após corrida concluída

BEGIN;

CREATE TABLE IF NOT EXISTS public.ride_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  passenger_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  tags text[] NOT NULL DEFAULT '{}'::text[],
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ride_id)
);

CREATE INDEX IF NOT EXISTS ride_reviews_passenger_created_idx
  ON public.ride_reviews(passenger_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ride_reviews_driver_created_idx
  ON public.ride_reviews(driver_id, created_at DESC);

ALTER TABLE public.ride_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ride_reviews_passenger_select_own ON public.ride_reviews;
CREATE POLICY ride_reviews_passenger_select_own
ON public.ride_reviews
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users passenger
    WHERE passenger.id = ride_reviews.passenger_id
      AND passenger.auth_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS ride_reviews_driver_select_own ON public.ride_reviews;
CREATE POLICY ride_reviews_driver_select_own
ON public.ride_reviews
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.drivers driver
    JOIN public.users driver_user ON driver_user.id = driver.user_id
    WHERE driver.id = ride_reviews.driver_id
      AND driver_user.auth_user_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.rate_driver_for_ride(
  _ride_id uuid,
  _rating integer,
  _tags text[] DEFAULT '{}'::text[],
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
  _review_id uuid;
  _normalized_tags text[];
  _normalized_comment text;
  _average_rating numeric(3,2);
BEGIN
  IF _auth_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF _rating < 1 OR _rating > 5 THEN
    RAISE EXCEPTION 'invalid_rating';
  END IF;

  SELECT id INTO _passenger_id
  FROM public.users
  WHERE auth_user_id = _auth_user_id OR id = _auth_user_id
  ORDER BY CASE WHEN auth_user_id = _auth_user_id THEN 0 ELSE 1 END
  LIMIT 1;

  IF _passenger_id IS NULL THEN
    RAISE EXCEPTION 'passenger_profile_missing';
  END IF;

  SELECT * INTO _ride
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

  SELECT COALESCE(array_agg(tag ORDER BY tag), '{}'::text[])
  INTO _normalized_tags
  FROM (
    SELECT DISTINCT left(btrim(value), 60) AS tag
    FROM unnest(COALESCE(_tags, '{}'::text[])) AS value
    WHERE btrim(value) <> ''
    LIMIT 8
  ) normalized;

  _normalized_comment := NULLIF(left(btrim(COALESCE(_comment, '')), 500), '');

  INSERT INTO public.ride_reviews (
    ride_id,
    passenger_id,
    driver_id,
    rating,
    tags,
    comment,
    created_at,
    updated_at
  ) VALUES (
    _ride.id,
    _passenger_id,
    _ride.driver_id,
    _rating,
    _normalized_tags,
    _normalized_comment,
    now(),
    now()
  )
  ON CONFLICT (ride_id)
  DO UPDATE SET
    rating = EXCLUDED.rating,
    tags = EXCLUDED.tags,
    comment = EXCLUDED.comment,
    updated_at = now()
  RETURNING id INTO _review_id;

  UPDATE public.rides
  SET passenger_rating = _rating,
      updated_at = now()
  WHERE id = _ride.id;

  SELECT round(avg(review.rating)::numeric, 2)
  INTO _average_rating
  FROM public.ride_reviews review
  WHERE review.driver_id = _ride.driver_id;

  UPDATE public.drivers
  SET rating = COALESCE(_average_rating, rating),
      updated_at = now()
  WHERE id = _ride.driver_id;

  UPDATE public.users driver_user
  SET average_rating = COALESCE(_average_rating, driver_user.average_rating),
      updated_at = now()
  FROM public.drivers driver
  WHERE driver.id = _ride.driver_id
    AND driver_user.id = driver.user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'review_id', _review_id,
    'ride_id', _ride.id,
    'rating', _rating,
    'driver_average_rating', _average_rating
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rate_driver_for_ride(uuid, integer, text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rate_driver_for_ride(uuid, integer, text[], text) TO authenticated, service_role;

COMMIT;
