
-- Harden EXECUTE grants on SECURITY DEFINER functions.
-- Revoke PUBLIC/anon from functions that should never be callable anonymously.
-- Keep get_ride_by_share_token accessible to anon (public share links by design).

REVOKE EXECUTE ON FUNCTION public.get_driver_stats(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_passenger_stats(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_driver_home_kpis(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_driver_public_profile(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_passenger_public_profile(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_driver_amenities_public(uuid) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.admin_analytics_overview() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_financial() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_top_passengers(text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_top_drivers(text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_top_cities(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_top_places(text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_new_users_timeseries(timestamptz, timestamptz, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_rides_timeseries(timestamptz, timestamptz, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_subscription_growth(timestamptz, timestamptz, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auto_suspend_overdue_subscriptions() FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.settle_cancellation_fee(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_driver_rating(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_passenger_rating(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_share_token() FROM PUBLIC, anon, authenticated;

-- Ensure share-link RPC remains callable anonymously (public share URLs)
GRANT EXECUTE ON FUNCTION public.get_ride_by_share_token(text) TO anon, authenticated;

-- Confirm authenticated retains what it needs
GRANT EXECUTE ON FUNCTION public.get_driver_stats(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_passenger_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_home_kpis(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_public_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_passenger_public_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_amenities_public(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.admin_analytics_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_financial() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_top_passengers(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_top_drivers(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_top_cities(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_top_places(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_new_users_timeseries(timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_rides_timeseries(timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_subscription_growth(timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_suspend_overdue_subscriptions() TO authenticated;

-- service_role keeps full access
GRANT EXECUTE ON FUNCTION public.settle_cancellation_fee(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recompute_driver_rating(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recompute_passenger_rating(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_share_token() TO service_role;
