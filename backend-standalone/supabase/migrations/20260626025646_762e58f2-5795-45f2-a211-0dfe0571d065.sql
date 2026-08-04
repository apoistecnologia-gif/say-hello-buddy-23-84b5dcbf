
-- Helper: extrair user_id do primeiro segmento do path
-- Convenção: arquivos salvos como "{auth.uid()}/arquivo.ext"

-- ============== driver-selfies ==============
CREATE POLICY "selfies_owner_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'driver-selfies' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "selfies_admin_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'driver-selfies' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "selfies_owner_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'driver-selfies' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "selfies_owner_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'driver-selfies' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "selfies_owner_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'driver-selfies' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- ============== driver-cnh ==============
CREATE POLICY "cnh_owner_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'driver-cnh' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "cnh_admin_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'driver-cnh' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "cnh_owner_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'driver-cnh' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "cnh_owner_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'driver-cnh' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "cnh_owner_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'driver-cnh' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- ============== vehicle-documents ==============
CREATE POLICY "veh_owner_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'vehicle-documents' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "veh_admin_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'vehicle-documents' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "veh_owner_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'vehicle-documents' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "veh_owner_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'vehicle-documents' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "veh_owner_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'vehicle-documents' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- ============== ride-attachments ==============
CREATE POLICY "ride_att_owner_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'ride-attachments' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "ride_att_admin_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'ride-attachments' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "ride_att_owner_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ride-attachments' AND (auth.uid())::text = (storage.foldername(name))[1]);
