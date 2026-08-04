
-- Public trust profile RPC — exposes only non-sensitive info to authenticated users.
-- No CPF, no CNH, no documents, no phone, no email.
CREATE OR REPLACE FUNCTION public.get_driver_public_profile(target_user_id uuid)
RETURNS TABLE (
  user_id uuid,
  name text,
  photo_url text,
  city text,
  state text,
  category text,
  vehicle_model text,
  vehicle_color text,
  vehicle_plate text,
  vehicle_year int,
  average_rating numeric,
  total_ratings int,
  completed_rides int,
  approval_status text,
  is_online boolean,
  member_since timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.user_id,
    d.name,
    COALESCE(d.photo_url, d.selfie_url) AS photo_url,
    d.city,
    d.state,
    d.category::text,
    d.vehicle_model,
    d.vehicle_color,
    d.vehicle_plate,
    d.vehicle_year,
    COALESCE(d.average_rating, d.rating) AS average_rating,
    COALESCE(d.total_ratings, 0) AS total_ratings,
    COALESCE(d.completed_rides, 0) AS completed_rides,
    d.approval_status::text,
    COALESCE(d.is_online, false) AS is_online,
    COALESCE(d.approved_at, d.created_at) AS member_since
  FROM public.drivers d
  WHERE d.user_id = target_user_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_driver_public_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_driver_public_profile(uuid) TO authenticated;
