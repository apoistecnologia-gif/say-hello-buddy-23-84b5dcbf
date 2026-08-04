
ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;

CREATE OR REPLACE FUNCTION public.generate_share_token()
RETURNS TEXT
LANGUAGE sql
VOLATILE
AS $$
  SELECT lower(replace(replace(encode(extensions.gen_random_bytes(9), 'base64'), '/', '_'), '+', '-'));
$$;

CREATE OR REPLACE FUNCTION public.set_ride_share_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.share_token IS NULL THEN
    NEW.share_token := public.generate_share_token();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rides_share_token ON public.rides;
CREATE TRIGGER trg_rides_share_token
  BEFORE INSERT ON public.rides
  FOR EACH ROW EXECUTE FUNCTION public.set_ride_share_token();

-- Backfill for existing rides
UPDATE public.rides SET share_token = public.generate_share_token()
  WHERE share_token IS NULL;

CREATE OR REPLACE FUNCTION public.get_ride_by_share_token(_token TEXT)
RETURNS TABLE(
  status TEXT,
  driver_first_name TEXT,
  driver_photo_url TEXT,
  vehicle_model TEXT,
  vehicle_color TEXT,
  vehicle_plate_masked TEXT,
  category TEXT,
  origin_name TEXT,
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
  plate TEXT;
  masked TEXT;
BEGIN
  IF _token IS NULL OR length(_token) < 6 THEN
    RETURN;
  END IF;
  SELECT * INTO r FROM public.rides WHERE share_token = _token LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  live := r.status::text IN ('aceita','motorista_a_caminho','motorista_chegou','em_viagem');
  first_name := split_part(COALESCE(r.driver_name, ''), ' ', 1);
  plate := COALESCE(regexp_replace(r.driver_vehicle, '.*\((.+)\).*', '\1'), '');
  IF plate = r.driver_vehicle OR length(plate) < 4 THEN plate := ''; END IF;
  masked := CASE
    WHEN length(plate) >= 4 THEN substr(plate, 1, 3) || '•' || substr(plate, length(plate) - 1)
    ELSE NULL
  END;

  RETURN QUERY SELECT
    r.status::text,
    NULLIF(first_name, ''),
    CASE WHEN live THEN r.driver_photo_url ELSE NULL END,
    NULL::text,  -- vehicle_model (kept null; driver_vehicle is a combined string)
    NULL::text,  -- vehicle_color
    masked,
    r.category::text,
    r.origin_name,
    r.destination_name,
    r.destination_lat,
    r.destination_lng,
    CASE WHEN live THEN r.driver_lat ELSE NULL END,
    CASE WHEN live THEN r.driver_lng ELSE NULL END,
    r.updated_at,
    live;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ride_by_share_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ride_by_share_token(TEXT) TO anon, authenticated;
