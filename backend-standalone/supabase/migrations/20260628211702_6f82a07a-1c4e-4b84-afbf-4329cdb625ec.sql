DROP POLICY IF EXISTS "admins insert inbox" ON public.notification_inbox;
CREATE POLICY "admins insert inbox" ON public.notification_inbox
  FOR INSERT TO authenticated
  WITH CHECK (private.is_admin(auth.uid()));