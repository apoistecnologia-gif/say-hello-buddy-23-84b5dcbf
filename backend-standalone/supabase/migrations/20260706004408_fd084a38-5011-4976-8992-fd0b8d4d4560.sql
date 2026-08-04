
-- 1) driver_financial_status enum
DO $$ BEGIN
  CREATE TYPE public.driver_financial_status AS ENUM ('inactive','pending','active','overdue','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) New columns on drivers
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS asaas_subscription_id text,
  ADD COLUMN IF NOT EXISTS financial_status public.driver_financial_status NOT NULL DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS subscription_value numeric(10,2),
  ADD COLUMN IF NOT EXISTS next_due_date date,
  ADD COLUMN IF NOT EXISTS last_payment_status text,
  ADD COLUMN IF NOT EXISTS last_payment_id text,
  ADD COLUMN IF NOT EXISTS last_invoice_url text;

CREATE INDEX IF NOT EXISTS idx_drivers_asaas_subscription_id ON public.drivers(asaas_subscription_id);
CREATE INDEX IF NOT EXISTS idx_drivers_asaas_customer_id ON public.drivers(asaas_customer_id);

-- 3) driver_payment_events table
CREATE TABLE IF NOT EXISTS public.driver_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  asaas_event text NOT NULL,
  asaas_payment_id text,
  asaas_subscription_id text,
  status text,
  value numeric(10,2),
  due_date date,
  paid_at timestamptz,
  invoice_url text,
  raw_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.driver_payment_events TO authenticated;
GRANT ALL ON public.driver_payment_events TO service_role;

ALTER TABLE public.driver_payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read all payment events"
  ON public.driver_payment_events FOR SELECT
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "drivers read own payment events"
  ON public.driver_payment_events FOR SELECT
  TO authenticated
  USING (
    driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_dpe_driver ON public.driver_payment_events(driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dpe_payment ON public.driver_payment_events(asaas_payment_id);
CREATE INDEX IF NOT EXISTS idx_dpe_subscription ON public.driver_payment_events(asaas_subscription_id);

-- 4) Mirror subscriptions.status -> drivers.financial_status
CREATE OR REPLACE FUNCTION public.sync_driver_financial_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_latest_id uuid;
BEGIN
  SELECT id INTO v_latest_id
    FROM public.subscriptions
   WHERE driver_id = NEW.driver_id
   ORDER BY created_at DESC LIMIT 1;
  IF v_latest_id IS NULL OR v_latest_id <> NEW.id THEN RETURN NEW; END IF;

  UPDATE public.drivers d
     SET financial_status = CASE NEW.status
           WHEN 'active'    THEN 'active'::driver_financial_status
           WHEN 'pending'   THEN 'pending'::driver_financial_status
           WHEN 'overdue'   THEN 'overdue'::driver_financial_status
           WHEN 'expired'   THEN 'overdue'::driver_financial_status
           WHEN 'vencida'   THEN 'overdue'::driver_financial_status
           WHEN 'cancelled' THEN 'cancelled'::driver_financial_status
           WHEN 'blocked'   THEN 'overdue'::driver_financial_status
           ELSE d.financial_status END,
         next_due_date = COALESCE(NEW.period_end::date, d.next_due_date),
         updated_at = now()
   WHERE d.id = NEW.driver_id;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_driver_financial_status ON public.subscriptions;
CREATE TRIGGER trg_sync_driver_financial_status
AFTER INSERT OR UPDATE OF status, period_end ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.sync_driver_financial_status();
