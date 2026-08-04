-- 1) Storage policies: migrate to private.has_role
DROP POLICY IF EXISTS "selfies_admin_select" ON storage.objects;
CREATE POLICY "selfies_admin_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'driver-selfies' AND private.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY IF EXISTS "cnh_admin_select" ON storage.objects;
CREATE POLICY "cnh_admin_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'driver-cnh' AND private.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY IF EXISTS "veh_admin_select" ON storage.objects;
CREATE POLICY "veh_admin_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'vehicle-documents' AND private.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY IF EXISTS "ride_att_admin_select" ON storage.objects;
CREATE POLICY "ride_att_admin_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'ride-attachments' AND private.has_role(auth.uid(),'admin'::public.app_role));

-- 2) admin_login_history: restrict INSERT to admins (block self-fabrication by passengers/drivers)
DROP POLICY IF EXISTS "login_history_insert" ON public.admin_login_history;
CREATE POLICY "login_history_insert" ON public.admin_login_history
  FOR INSERT TO authenticated
  WITH CHECK (private.is_admin(auth.uid()) AND user_id = auth.uid());

-- 3) Document the intentional no-UPDATE-policy for rides (mutations go through supabaseAdmin via rideLifecycle)
COMMENT ON TABLE public.rides IS
  'Ride lifecycle mutations (accept, start, finish, cancel, rate) are performed server-side via service role in src/lib/rideLifecycle.ts after manual ownership/state validation. RLS intentionally exposes only SELECT to participants and admin-only UPDATE — direct client UPDATEs must fail.';