
ALTER TABLE public.driver_public_locations
  ADD COLUMN IF NOT EXISTS current_heading double precision,
  ADD COLUMN IF NOT EXISTS current_speed double precision,
  ADD COLUMN IF NOT EXISTS last_location_at timestamptz;

ALTER TABLE public.driver_public_locations REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'driver_public_locations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_public_locations';
  END IF;
END$$;

-- Allow drivers to upsert their own public location row
DROP POLICY IF EXISTS dpl_upsert_self ON public.driver_public_locations;
CREATE POLICY dpl_upsert_self ON public.driver_public_locations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS dpl_update_self ON public.driver_public_locations;
CREATE POLICY dpl_update_self ON public.driver_public_locations
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.driver_public_locations TO authenticated;
GRANT ALL ON public.driver_public_locations TO service_role;
