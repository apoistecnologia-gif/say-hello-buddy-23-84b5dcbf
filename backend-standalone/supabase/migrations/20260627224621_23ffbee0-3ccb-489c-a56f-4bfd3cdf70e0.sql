
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS photo_url text;

-- Storage policies for profile-photos
DROP POLICY IF EXISTS "profile_photos_read_authenticated" ON storage.objects;
CREATE POLICY "profile_photos_read_authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'profile-photos');

DROP POLICY IF EXISTS "profile_photos_insert_own" ON storage.objects;
CREATE POLICY "profile_photos_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "profile_photos_update_own" ON storage.objects;
CREATE POLICY "profile_photos_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "profile_photos_delete_own" ON storage.objects;
CREATE POLICY "profile_photos_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin(auth.uid()))
  );

DROP POLICY IF EXISTS "profile_photos_admin_all" ON storage.objects;
CREATE POLICY "profile_photos_admin_all"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'profile-photos' AND public.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'profile-photos' AND public.is_admin(auth.uid()));
