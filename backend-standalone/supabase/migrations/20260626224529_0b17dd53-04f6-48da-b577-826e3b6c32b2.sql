CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO service_role;

ALTER POLICY "settings_admin_write" ON public.admin_settings
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "drivers_delete_admin" ON public.drivers
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "drivers_select_self_or_admin" ON public.drivers
  USING ((auth.uid() = user_id) OR private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "drivers_update_self_or_admin" ON public.drivers
  USING ((auth.uid() = user_id) OR private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK ((auth.uid() = user_id) OR private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "notif_insert_self_or_admin" ON public.notifications
  WITH CHECK ((user_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "payments_select_self_or_admin" ON public.payments
  USING ((user_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "payments_update_admin" ON public.payments
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "rides_select_involved_or_admin" ON public.rides
  USING ((passenger_id = auth.uid()) OR (driver_id = auth.uid()) OR (current_offer_driver_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "rides_update_involved_or_admin" ON public.rides
  USING ((passenger_id = auth.uid()) OR (driver_id = auth.uid()) OR (current_offer_driver_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "sos_select_self_or_admin" ON public.sos_alerts
  USING ((user_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "sos_update_admin" ON public.sos_alerts
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "subs_admin_write" ON public.subscriptions
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "subs_select_self_or_admin" ON public.subscriptions
  USING ((driver_id = auth.uid()) OR private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "user_roles_admin_write" ON public.user_roles
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "user_roles_select_self_or_admin" ON public.user_roles
  USING ((auth.uid() = user_id) OR private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "users_select_self_or_admin" ON public.users
  USING ((auth.uid() = auth_user_id) OR private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "users_update_self_or_admin" ON public.users
  USING ((auth.uid() = auth_user_id) OR private.has_role(auth.uid(), 'admin'::public.app_role));

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;