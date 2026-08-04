
DROP POLICY IF EXISTS "anyone can insert their own gps diag" ON public.gps_diagnostics;
CREATE POLICY "authenticated can insert own gps diag"
  ON public.gps_diagnostics
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

REVOKE EXECUTE ON FUNCTION public.get_driver_public_stats(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.request_driver_withdrawal(numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_driver_financial_status() FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_driver_withdrawal_failed(uuid, text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_driver_withdrawal_paid(uuid, text, text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.settle_cancellation_fee(uuid) FROM anon, authenticated;

ALTER TABLE public.drivers ENABLE ALWAYS TRIGGER drivers_prevent_privileged_updates;
