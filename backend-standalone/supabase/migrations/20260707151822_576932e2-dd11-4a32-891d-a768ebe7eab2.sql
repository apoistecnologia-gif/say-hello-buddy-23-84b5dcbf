
-- ============================================================
-- P0 RLS HARDENING — app_settings & driver_amenities
-- ============================================================

-- 1) app_settings: add is_public flag, backfill true, restrict SELECT
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

-- Existing settings are all operational config already consumed by the client;
-- keep them public. New rows default to public — flip to false for anything sensitive.
UPDATE public.app_settings SET is_public = true WHERE is_public IS DISTINCT FROM true;

DROP POLICY IF EXISTS app_settings_read ON public.app_settings;
CREATE POLICY app_settings_read ON public.app_settings
  FOR SELECT TO authenticated
  USING (
    is_public = true
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- 2) driver_amenities: restrict SELECT to owner + admins
DROP POLICY IF EXISTS "Anyone authenticated can view amenities" ON public.driver_amenities;

CREATE POLICY "Owner or admin can view amenities"
  ON public.driver_amenities FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- Public read path for passenger-facing driver profile
CREATE OR REPLACE FUNCTION public.get_driver_amenities_public(target_user_id uuid)
RETURNS TABLE (
  user_id uuid,
  charger boolean,
  water boolean,
  candy boolean,
  music_on_demand boolean,
  pet_friendly boolean,
  large_luggage boolean,
  air_conditioning boolean,
  wifi boolean,
  child_seat boolean,
  quiet_ride boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.user_id,
    a.charger, a.water, a.candy, a.music_on_demand, a.pet_friendly,
    a.large_luggage, a.air_conditioning, a.wifi, a.child_seat, a.quiet_ride
  FROM public.driver_amenities a
  WHERE a.user_id = target_user_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_driver_amenities_public(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_driver_amenities_public(uuid) TO authenticated;
