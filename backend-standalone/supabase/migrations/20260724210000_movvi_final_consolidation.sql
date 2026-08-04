-- MOVVI final consolidation:
-- payment idempotency, canonical provider fields, correct subscription states,
-- server audit provenance and support replies.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS provider_payment_id text;

CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_payment_id
  ON public.subscriptions(provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.payment_webhook_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_key text NOT NULL,
  request_id text,
  status text NOT NULL DEFAULT 'processing',
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE(provider, event_key)
);

ALTER TABLE public.payment_webhook_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_webhook_receipts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.payment_webhook_receipts TO service_role;

DROP POLICY IF EXISTS payment_webhook_receipts_admin_read
  ON public.payment_webhook_receipts;
CREATE POLICY payment_webhook_receipts_admin_read
  ON public.payment_webhook_receipts
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

ALTER TABLE public.admin_audit_logs
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'client';

CREATE OR REPLACE FUNCTION public.auto_suspend_overdue_subscriptions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH overdue AS (
    UPDATE public.subscriptions
       SET status = 'overdue',
           updated_at = now()
     WHERE status = 'active'
       AND auto_suspend = true
       AND period_end IS NOT NULL
       AND now() > COALESCE(grace_until, period_end)
    RETURNING driver_id
  )
  UPDATE public.drivers d
     SET subscription_status = 'overdue',
         financial_status = 'overdue',
         is_online = false,
         updated_at = now()
    FROM overdue o
   WHERE d.user_id = o.driver_id;

END;
$function$;

REVOKE ALL ON FUNCTION public.auto_suspend_overdue_subscriptions()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_suspend_overdue_subscriptions()
  TO service_role;

CREATE TABLE IF NOT EXISTS public.support_ticket_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_replies_ticket
  ON public.support_ticket_replies(ticket_id, created_at DESC);
ALTER TABLE public.support_ticket_replies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_ticket_replies FROM PUBLIC, anon;
GRANT SELECT ON public.support_ticket_replies TO authenticated;
GRANT ALL ON public.support_ticket_replies TO service_role;

DROP POLICY IF EXISTS support_ticket_replies_own_read
  ON public.support_ticket_replies;
CREATE POLICY support_ticket_replies_own_read
  ON public.support_ticket_replies
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR private.has_role(auth.uid(), 'support'::public.app_role)
  );

-- Legacy gateway rows remain for historical data, but only Mercado Pago may
-- appear enabled. Runtime credentials continue to live in Edge Function secrets.
UPDATE public.payment_gateways
   SET enabled = false
 WHERE provider <> 'mercadopago';

-- Preserve the current cron authorization header while moving the request away
-- from the retired Lovable deployment.
DO $block$
DECLARE
  job record;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    FOR job IN
      SELECT jobid, command
      FROM cron.job
      WHERE jobname = 'renew-driver-subscriptions-daily'
    LOOP
      PERFORM cron.alter_job(
        job.jobid,
        command := replace(
          job.command,
          'https://project--0900bef2-57d2-47b9-93b1-0ea5defee501.lovable.app',
          'https://movvi-backend-standalone.onrender.com'
        )
      );
    END LOOP;
  END IF;
END;
$block$;

NOTIFY pgrst, 'reload schema';
