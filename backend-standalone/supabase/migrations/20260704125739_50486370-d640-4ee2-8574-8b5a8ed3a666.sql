
-- 1. app_settings: restrict SELECT to authenticated
DROP POLICY IF EXISTS app_settings_read ON public.app_settings;
CREATE POLICY app_settings_read ON public.app_settings
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.app_settings FROM anon;

-- 2. driver_announcements: restrict to authenticated
DROP POLICY IF EXISTS ann_read ON public.driver_announcements;
CREATE POLICY ann_read ON public.driver_announcements
  FOR SELECT TO authenticated
  USING ((active = true) OR private.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS ann_admin_write ON public.driver_announcements;
CREATE POLICY ann_admin_write ON public.driver_announcements
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
REVOKE SELECT ON public.driver_announcements FROM anon;

-- 3. drivers: prevent self-escalation of privileged columns
CREATE OR REPLACE FUNCTION public.prevent_driver_privileged_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins bypass all checks
  IF private.has_role(auth.uid(), 'admin'::app_role)
     OR private.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Non-admin (i.e., the driver themselves): forbid changes to privileged columns
  IF NEW.approval_status       IS DISTINCT FROM OLD.approval_status
  OR NEW.subscription_status   IS DISTINCT FROM OLD.subscription_status
  OR NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at
  OR NEW.approved_at           IS DISTINCT FROM OLD.approved_at
  OR NEW.motivo_reprovacao     IS DISTINCT FROM OLD.motivo_reprovacao
  THEN
    RAISE EXCEPTION 'driver_privileged_columns_readonly'
      USING ERRCODE = '42501',
            HINT = 'Only admins may change approval, subscription, or moderation fields.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS drivers_prevent_privileged_updates ON public.drivers;
CREATE TRIGGER drivers_prevent_privileged_updates
  BEFORE UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.prevent_driver_privileged_updates();

-- 4. rides: scope SELECT policy to authenticated only
DROP POLICY IF EXISTS rides_select_involved_or_admin ON public.rides;
CREATE POLICY rides_select_involved_or_admin ON public.rides
  FOR SELECT TO authenticated
  USING (
    passenger_id = auth.uid()
    OR driver_id = auth.uid()
    OR accepted_driver_id = auth.uid()
    OR (auth.uid() = ANY (candidate_driver_ids) AND NOT (auth.uid() = ANY (rejected_driver_ids)))
    OR private.has_role(auth.uid(), 'admin'::app_role)
  );
REVOKE SELECT ON public.rides FROM anon;

-- Rides UPDATE remains admin-only via rides_update_admin_only (already scoped to authenticated).
-- Confirm no anon UPDATE surface exists.
REVOKE INSERT, UPDATE, DELETE ON public.rides FROM anon;

-- 5. user_roles: prevent admins from promoting to super_admin; only super_admin can
DROP POLICY IF EXISTS user_roles_admin_write ON public.user_roles;
CREATE POLICY user_roles_admin_write ON public.user_roles
  FOR ALL TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      private.has_role(auth.uid(), 'admin'::app_role)
      AND role NOT IN ('admin'::app_role, 'super_admin'::app_role)
    )
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      private.has_role(auth.uid(), 'admin'::app_role)
      AND role NOT IN ('admin'::app_role, 'super_admin'::app_role)
    )
  );

-- 6. SECURITY DEFINER maintenance function no longer executable by end users
REVOKE EXECUTE ON FUNCTION public.auto_suspend_overdue_subscriptions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_suspend_overdue_subscriptions() TO service_role;
