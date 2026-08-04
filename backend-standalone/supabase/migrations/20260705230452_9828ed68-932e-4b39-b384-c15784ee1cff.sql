
CREATE TABLE public.driver_amenities (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  charger BOOLEAN NOT NULL DEFAULT false,
  water BOOLEAN NOT NULL DEFAULT false,
  candy BOOLEAN NOT NULL DEFAULT false,
  music_on_demand BOOLEAN NOT NULL DEFAULT false,
  pet_friendly BOOLEAN NOT NULL DEFAULT false,
  large_luggage BOOLEAN NOT NULL DEFAULT false,
  air_conditioning BOOLEAN NOT NULL DEFAULT false,
  wifi BOOLEAN NOT NULL DEFAULT false,
  child_seat BOOLEAN NOT NULL DEFAULT false,
  quiet_ride BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_amenities TO authenticated;
GRANT ALL ON public.driver_amenities TO service_role;

ALTER TABLE public.driver_amenities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view amenities"
  ON public.driver_amenities FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Drivers manage own amenities"
  ON public.driver_amenities FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_driver_amenities_updated_at
  BEFORE UPDATE ON public.driver_amenities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
