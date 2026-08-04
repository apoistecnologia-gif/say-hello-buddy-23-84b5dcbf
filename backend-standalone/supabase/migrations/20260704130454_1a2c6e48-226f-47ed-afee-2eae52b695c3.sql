
DROP POLICY IF EXISTS settings_select_all ON public.admin_settings;
CREATE POLICY settings_select_admin ON public.admin_settings
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
  );
REVOKE SELECT ON public.admin_settings FROM anon;
