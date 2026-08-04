
-- Recreate as SECURITY INVOKER — RLS on rides already restricts to passenger/admin.
CREATE OR REPLACE FUNCTION public.get_passenger_stats(_user_id uuid)
RETURNS TABLE(total_rides bigint, completed_rides bigint, cancelled_rides bigint, total_spent numeric, avg_rating numeric)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
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

-- Move can_view_profile_photo into the private schema; storage owner can still call it.
CREATE OR REPLACE FUNCTION private.can_view_profile_photo(_viewer uuid, _owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _viewer = _owner
    OR private.is_admin(_viewer)
    OR EXISTS (
      SELECT 1 FROM public.rides r
      WHERE (r.passenger_id = _viewer OR r.driver_id = _viewer)
        AND (r.passenger_id = _owner OR r.driver_id = _owner)
        AND r.status::text IN ('procurar_motorista','motorista_a_caminho','motorista_chegou','em_viagem','finalizada')
    )
$$;
REVOKE ALL ON FUNCTION private.can_view_profile_photo(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_view_profile_photo(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS profile_photos_read_scoped ON storage.objects;
CREATE POLICY profile_photos_read_scoped ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND private.can_view_profile_photo(
      auth.uid(),
      (NULLIF((storage.foldername(name))[1], ''))::uuid
    )
  );

DROP FUNCTION IF EXISTS public.can_view_profile_photo(uuid, uuid);
