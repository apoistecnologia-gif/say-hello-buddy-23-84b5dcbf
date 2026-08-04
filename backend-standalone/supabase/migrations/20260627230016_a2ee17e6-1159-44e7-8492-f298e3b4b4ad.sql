
CREATE OR REPLACE FUNCTION public.can_view_profile_photo(_viewer uuid, _owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _viewer IS NOT NULL AND (
      _viewer = _owner
      OR public.is_admin(_viewer)
      OR EXISTS (
        SELECT 1 FROM public.rides r
        LEFT JOIN public.drivers d ON d.id = r.driver_id
        WHERE
          (r.passenger_id = _viewer AND d.user_id = _owner)
          OR (r.passenger_id = _owner AND d.user_id = _viewer)
      )
    )
$$;

GRANT EXECUTE ON FUNCTION public.can_view_profile_photo(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS profile_photos_read_authenticated ON storage.objects;

CREATE POLICY profile_photos_read_scoped
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND public.can_view_profile_photo(
    auth.uid(),
    NULLIF((storage.foldername(name))[1], '')::uuid
  )
);
