-- Security Hardening Phase 5: Minimize EXECUTE privileges on SECURITY DEFINER functions.
-- No SQL logic, signatures, or triggers changed. Only revoke EXECUTE from anon where not needed.

-- Admin analytics: only called by authenticated admins from admin routes (function also
-- enforces private.is_admin() internally). Remove anon EXECUTE.
REVOKE EXECUTE ON FUNCTION public.admin_analytics_overview() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_financial() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_rides_timeseries(timestamptz, timestamptz, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_new_users_timeseries(timestamptz, timestamptz, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_subscription_growth(timestamptz, timestamptz, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_top_cities(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_top_places(text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_top_drivers(text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_top_passengers(text, integer) FROM anon;

-- Public profile RPCs: called by authenticated users viewing driver/passenger profiles.
-- Never needed for signed-out browsing. Revoke anon.
REVOKE EXECUTE ON FUNCTION public.get_driver_public_profile(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_passenger_public_profile(uuid) FROM anon;

-- Private role helper: only used by server functions (authenticated JWT) and RLS policies.
-- Never called by anonymous users. Revoke anon.
REVOKE EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) FROM anon;

-- Also revoke from PUBLIC (the implicit =X/postgres grant seen on some analytics fns).
REVOKE EXECUTE ON FUNCTION public.admin_analytics_overview() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_financial() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_rides_timeseries(timestamptz, timestamptz, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_new_users_timeseries(timestamptz, timestamptz, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_subscription_growth(timestamptz, timestamptz, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_top_cities(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_top_places(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_top_drivers(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_analytics_top_passengers(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;