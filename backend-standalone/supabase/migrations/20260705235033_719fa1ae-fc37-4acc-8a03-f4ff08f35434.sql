
REVOKE EXECUTE ON FUNCTION public.apply_cancellation_policy() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.settle_cancellation_fee(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_cancellation_fee(uuid) TO service_role;
