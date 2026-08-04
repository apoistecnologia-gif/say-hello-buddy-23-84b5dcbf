
CREATE OR REPLACE FUNCTION public.get_driver_public_stats(p_user_id uuid)
RETURNS TABLE(completed_rides integer, rating numeric, total_ratings integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(d.completed_rides, 0)::int,
    COALESCE(d.average_rating, d.rating, 5)::numeric,
    COALESCE(d.total_ratings, 0)::int
  FROM public.drivers d
  WHERE d.user_id = p_user_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_driver_public_stats(uuid) TO authenticated, anon;
