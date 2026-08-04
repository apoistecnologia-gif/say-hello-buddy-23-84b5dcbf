
-- Migrate storage policies off public.is_admin
DROP POLICY IF EXISTS profile_photos_admin_all ON storage.objects;
CREATE POLICY profile_photos_admin_all ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'profile-photos' AND private.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'profile-photos' AND private.is_admin(auth.uid()));

DROP POLICY IF EXISTS profile_photos_delete_own ON storage.objects;
CREATE POLICY profile_photos_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND (owner = auth.uid() OR private.is_admin(auth.uid()))
  );

-- Now retry the rest
DROP VIEW IF EXISTS public.drivers_public;

CREATE TABLE IF NOT EXISTS public.driver_public_locations (
  user_id uuid PRIMARY KEY,
  name text,
  category text,
  vehicle_model text,
  vehicle_color text,
  current_lat double precision,
  current_lng double precision,
  rating numeric,
  photo_url text,
  is_online boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.driver_public_locations TO authenticated;
GRANT ALL ON public.driver_public_locations TO service_role;
ALTER TABLE public.driver_public_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dpl_read_authenticated ON public.driver_public_locations;
CREATE POLICY dpl_read_authenticated ON public.driver_public_locations
  FOR SELECT TO authenticated USING (is_online = true);

CREATE OR REPLACE FUNCTION public.sync_driver_public_location()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    DELETE FROM public.driver_public_locations WHERE user_id = OLD.user_id;
    RETURN OLD;
  END IF;
  IF NEW.approval_status = 'aprovado'::driver_approval_status THEN
    INSERT INTO public.driver_public_locations
      (user_id, name, category, vehicle_model, vehicle_color, current_lat, current_lng, rating, photo_url, is_online, updated_at)
    VALUES
      (NEW.user_id, NEW.name, NEW.category, NEW.vehicle_model, NEW.vehicle_color, NEW.current_lat, NEW.current_lng, NEW.rating, NEW.photo_url, COALESCE(NEW.is_online,false), now())
    ON CONFLICT (user_id) DO UPDATE SET
      name=EXCLUDED.name, category=EXCLUDED.category, vehicle_model=EXCLUDED.vehicle_model, vehicle_color=EXCLUDED.vehicle_color,
      current_lat=EXCLUDED.current_lat, current_lng=EXCLUDED.current_lng, rating=EXCLUDED.rating, photo_url=EXCLUDED.photo_url,
      is_online=EXCLUDED.is_online, updated_at=now();
  ELSE
    DELETE FROM public.driver_public_locations WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.sync_driver_public_location() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_driver_public_location ON public.drivers;
CREATE TRIGGER trg_sync_driver_public_location
AFTER INSERT OR UPDATE OR DELETE ON public.drivers
FOR EACH ROW EXECUTE FUNCTION public.sync_driver_public_location();

INSERT INTO public.driver_public_locations
  (user_id, name, category, vehicle_model, vehicle_color, current_lat, current_lng, rating, photo_url, is_online, updated_at)
SELECT d.user_id, d.name, d.category, d.vehicle_model, d.vehicle_color,
       d.current_lat, d.current_lng, d.rating, d.photo_url, COALESCE(d.is_online,false), now()
FROM public.drivers d
WHERE d.approval_status = 'aprovado'::driver_approval_status
ON CONFLICT (user_id) DO NOTHING;

DROP FUNCTION IF EXISTS public.is_admin(uuid);

REVOKE ALL ON FUNCTION public.auto_suspend_overdue_subscriptions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_suspend_overdue_subscriptions() TO service_role;
