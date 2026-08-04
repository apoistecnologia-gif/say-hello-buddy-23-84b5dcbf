CREATE OR REPLACE FUNCTION public.get_passenger_public_profile(target_user_id uuid)
RETURNS TABLE (
  user_id uuid,
  name text,
  photo_url text,
  city text,
  average_rating numeric,
  total_ratings integer,
  completed_rides integer,
  member_since timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.auth_user_id AS user_id,
    u.name,
    u.avatar_url AS photo_url,
    u.city,
    COALESCE(u.average_rating, 0)::numeric AS average_rating,
    COALESCE(u.total_ratings, 0) AS total_ratings,
    COALESCE(u.completed_rides, 0) AS completed_rides,
    u.created_at AS member_since
  FROM public.users u
  WHERE u.auth_user_id = target_user_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_passenger_public_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_passenger_public_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_passenger_public_profile(uuid) TO service_role;