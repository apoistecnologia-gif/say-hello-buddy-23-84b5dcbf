
-- Default-deny EXECUTE on all public SECURITY DEFINER functions, then re-grant to
-- authenticated only for the ones actually invoked via PostgREST/RPC from the app.

REVOKE EXECUTE ON FUNCTION public.enforce_single_rating() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_driver_rating(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_passenger_rating(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_ride_rating() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_driver_subscription_from_subscriptions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_driver_public_location() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_driver_privileged_updates() FROM PUBLIC, anon, authenticated;

-- Admin-only analytics / maintenance: revoke from all app roles; role check inside still runs when needed by service_role.
REVOKE EXECUTE ON FUNCTION public.admin_analytics_overview() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_financial() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_rides_timeseries(timestamptz, timestamptz, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_new_users_timeseries(timestamptz, timestamptz, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_subscription_growth(timestamptz, timestamptz, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_top_cities(int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_top_drivers(text, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_top_passengers(text, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_top_places(text, int) FROM PUBLIC, anon;

-- Public-profile lookups and user-scoped stats keep authenticated EXECUTE (they check auth.uid internally).
REVOKE EXECUTE ON FUNCTION public.get_driver_public_profile(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_passenger_public_profile(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_passenger_stats(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_driver_home_kpis(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_driver_stats(uuid, timestamptz, timestamptz) FROM anon;
