
REVOKE ALL ON FUNCTION public.recompute_driver_rating(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_passenger_rating(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_ride_rating() FROM PUBLIC, anon, authenticated;
