
DROP FUNCTION IF EXISTS public.get_ride_by_share_token(TEXT);

CREATE FUNCTION public.get_ride_by_share_token(_token TEXT)
RETURNS TABLE(
  status TEXT,
  driver_first_name TEXT,
  driver_photo_url TEXT,
  vehicle_model TEXT,
  vehicle_color TEXT,
  vehicle_plate_masked TEXT,
  category TEXT,
  origin_name TEXT,
  origin_lat DOUBLE PRECISION,
  origin_lng DOUBLE PRECISION,
  destination_name TEXT,
  destination_lat DOUBLE PRECISION,
  destination_lng DOUBLE PRECISION,
  driver_lat DOUBLE PRECISION,
  driver_lng DOUBLE PRECISION,
  updated_at TIMESTAMPTZ,
  is_live BOOLEAN
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.rides%ROWTYPE;
  live BOOLEAN;
  first_name TEXT;
  live_lat DOUBLE PRECISION;
  live_lng DOUBLE PRECISION;
  live_updated TIMESTAMPTZ;
  drv_model TEXT;
  drv_color TEXT;
  drv_photo TEXT;
  drv_plate TEXT;
  masked TEXT;
BEGIN
  IF _token IS NULL OR length(_token) < 6 THEN RETURN; END IF;
  SELECT * INTO r FROM public.rides WHERE share_token = _token LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  live := r.status::text IN ('aceita','motorista_a_caminho','motorista_chegou','em_viagem');
  first_name := NULLIF(split_part(COALESCE(r.driver_name, ''), ' ', 1), '');

  IF live AND r.driver_id IS NOT NULL THEN
    SELECT dpl.current_lat, dpl.current_lng, dpl.updated_at
      INTO live_lat, live_lng, live_updated
      FROM public.driver_public_locations dpl
      WHERE dpl.user_id = r.driver_id LIMIT 1;
  END IF;

  IF r.driver_id IS NOT NULL THEN
    SELECT d.vehicle_model, d.vehicle_color, COALESCE(d.photo_url, d.selfie_url), d.vehicle_plate
      INTO drv_model, drv_color, drv_photo, drv_plate
      FROM public.drivers d WHERE d.user_id = r.driver_id LIMIT 1;
  END IF;

  masked := CASE
    WHEN drv_plate IS NOT NULL AND length(drv_plate) >= 5
      THEN substr(drv_plate, 1, 3) || '•' || substr(drv_plate, length(drv_plate) - 1)
    ELSE NULL
  END;

  RETURN QUERY SELECT
    r.status::text,
    first_name,
    CASE WHEN live THEN drv_photo ELSE NULL END,
    drv_model,
    drv_color,
    masked,
    r.category::text,
    r.origin_name,
    r.origin_lat,
    r.origin_lng,
    r.destination_name,
    r.destination_lat,
    r.destination_lng,
    CASE WHEN live THEN COALESCE(live_lat, r.driver_lat) ELSE NULL END,
    CASE WHEN live THEN COALESCE(live_lng, r.driver_lng) ELSE NULL END,
    COALESCE(live_updated, r.updated_at),
    live;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ride_by_share_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ride_by_share_token(TEXT) TO anon, authenticated;
