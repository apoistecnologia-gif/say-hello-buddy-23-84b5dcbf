
-- ============================================================
-- 1) private.is_admin (security definer, hidden from anon/auth)
-- ============================================================
CREATE OR REPLACE FUNCTION private.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','super_admin','financial','support','operations','readonly')
  )
$$;

REVOKE ALL ON FUNCTION private.is_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO authenticated, service_role;

-- ============================================================
-- 2) Migrate policies still using public.has_role / is_admin
-- ============================================================

-- admin_audit_logs
DROP POLICY IF EXISTS audit_read ON public.admin_audit_logs;
CREATE POLICY audit_read ON public.admin_audit_logs FOR SELECT TO authenticated
  USING (private.is_admin(auth.uid()));
DROP POLICY IF EXISTS audit_insert ON public.admin_audit_logs;
CREATE POLICY audit_insert ON public.admin_audit_logs FOR INSERT TO authenticated
  WITH CHECK (private.is_admin(auth.uid()));

-- admin_login_history (also fixes the "always true" finding)
DROP POLICY IF EXISTS login_history_read ON public.admin_login_history;
CREATE POLICY login_history_read ON public.admin_login_history FOR SELECT TO authenticated
  USING (private.is_admin(auth.uid()));
DROP POLICY IF EXISTS login_history_insert ON public.admin_login_history;
CREATE POLICY login_history_insert ON public.admin_login_history FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- admin_users_meta
DROP POLICY IF EXISTS "admins read admin_users_meta" ON public.admin_users_meta;
CREATE POLICY "admins read admin_users_meta" ON public.admin_users_meta FOR SELECT TO authenticated
  USING (private.is_admin(auth.uid()));
DROP POLICY IF EXISTS "super admins manage admin_users_meta" ON public.admin_users_meta;
CREATE POLICY "super admins manage admin_users_meta" ON public.admin_users_meta FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'admin'::app_role));

-- app_settings
DROP POLICY IF EXISTS app_settings_write ON public.app_settings;
CREATE POLICY app_settings_write ON public.app_settings FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'super_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'super_admin'::app_role));

-- backups
DROP POLICY IF EXISTS backups_admin_all ON public.backups;
CREATE POLICY backups_admin_all ON public.backups FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'super_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'super_admin'::app_role));

-- coupon_redemptions
DROP POLICY IF EXISTS redemptions_read ON public.coupon_redemptions;
CREATE POLICY redemptions_read ON public.coupon_redemptions FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR private.is_admin(auth.uid()));

-- coupons
DROP POLICY IF EXISTS coupons_write ON public.coupons;
CREATE POLICY coupons_write ON public.coupons FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'super_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'super_admin'::app_role));

-- gps_diagnostics
DROP POLICY IF EXISTS "admins can read gps diag" ON public.gps_diagnostics;
CREATE POLICY "admins can read gps diag" ON public.gps_diagnostics FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role));

-- notification_channels
DROP POLICY IF EXISTS notification_channels_admin_all ON public.notification_channels;
CREATE POLICY notification_channels_admin_all ON public.notification_channels FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'super_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'super_admin'::app_role));

-- notifications_broadcast
DROP POLICY IF EXISTS broadcast_read ON public.notifications_broadcast;
CREATE POLICY broadcast_read ON public.notifications_broadcast FOR SELECT TO authenticated
  USING (private.is_admin(auth.uid()));
DROP POLICY IF EXISTS broadcast_insert ON public.notifications_broadcast;
CREATE POLICY broadcast_insert ON public.notifications_broadcast FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role)
    OR private.has_role(auth.uid(),'super_admin'::app_role)
    OR private.has_role(auth.uid(),'operations'::app_role));

-- payment_gateways
DROP POLICY IF EXISTS payment_gateways_admin_all ON public.payment_gateways;
CREATE POLICY payment_gateways_admin_all ON public.payment_gateways FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'financial'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'financial'::app_role));

-- ride_categories
DROP POLICY IF EXISTS ride_categories_write ON public.ride_categories;
CREATE POLICY ride_categories_write ON public.ride_categories FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'super_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'super_admin'::app_role));

-- security_settings
DROP POLICY IF EXISTS security_settings_admin_all ON public.security_settings;
CREATE POLICY security_settings_admin_all ON public.security_settings FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'super_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'super_admin'::app_role));

-- subscription_plans
DROP POLICY IF EXISTS plans_write ON public.subscription_plans;
CREATE POLICY plans_write ON public.subscription_plans FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'financial'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'financial'::app_role));

-- tariff_rules
DROP POLICY IF EXISTS tariff_rules_write ON public.tariff_rules;
CREATE POLICY tariff_rules_write ON public.tariff_rules FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'financial'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'admin'::app_role) OR private.has_role(auth.uid(),'super_admin'::app_role) OR private.has_role(auth.uid(),'financial'::app_role));

-- ============================================================
-- 3) Revoke EXECUTE on sensitive public functions
-- ============================================================
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_suspend_overdue_subscriptions() FROM PUBLIC, anon, authenticated;

-- Keep these callable from clients/storage but not by anon:
REVOKE ALL ON FUNCTION public.can_view_profile_photo(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_profile_photo(uuid, uuid) TO authenticated, service_role;

-- ============================================================
-- 4) Harden get_passenger_stats: caller must be the owner or admin
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_passenger_stats(_user_id uuid)
RETURNS TABLE(total_rides bigint, completed_rides bigint, cancelled_rides bigint, total_spent numeric, avg_rating numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
      COALESCE(AVG(passenger_rating) FILTER (WHERE passenger_rating IS NOT NULL), 0) AS avg_rating
    FROM public.rides
    WHERE passenger_id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_passenger_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_passenger_stats(uuid) TO authenticated, service_role;

-- ============================================================
-- 5) drivers_public view — safe columns only, for passenger UIs
-- ============================================================
DROP VIEW IF EXISTS public.drivers_public;
CREATE VIEW public.drivers_public
WITH (security_invoker = false)
AS
SELECT
  d.user_id,
  d.name,
  d.category,
  d.vehicle_model,
  d.vehicle_color,
  d.current_lat,
  d.current_lng,
  d.rating,
  d.photo_url,
  d.is_online,
  d.approval_status
FROM public.drivers d
WHERE d.is_online = true
  AND d.approval_status = 'aprovado'::driver_approval_status;

REVOKE ALL ON public.drivers_public FROM PUBLIC, anon;
GRANT SELECT ON public.drivers_public TO authenticated, service_role;

-- Drop the broad PII-leaking policy
DROP POLICY IF EXISTS drivers_select_online_for_passengers ON public.drivers;

-- ============================================================
-- 6) Restrict rides UPDATE to admins (server fns use service role)
-- ============================================================
DROP POLICY IF EXISTS rides_update_involved_or_admin ON public.rides;
CREATE POLICY rides_update_admin_only ON public.rides FOR UPDATE TO authenticated
  USING (private.is_admin(auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()));
