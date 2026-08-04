
-- Add Mercado Pago columns to drivers and generalize payment events
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS mercadopago_preapproval_id TEXT,
  ADD COLUMN IF NOT EXISTS mercadopago_init_point TEXT,
  ADD COLUMN IF NOT EXISTS mercadopago_payer_id TEXT;

CREATE INDEX IF NOT EXISTS idx_drivers_mp_preapproval ON public.drivers(mercadopago_preapproval_id);

ALTER TABLE public.driver_payment_events
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'asaas',
  ADD COLUMN IF NOT EXISTS event_type TEXT,
  ADD COLUMN IF NOT EXISTS mp_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS mp_preapproval_id TEXT,
  ALTER COLUMN asaas_event DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dpe_mp_preapproval ON public.driver_payment_events(mp_preapproval_id);
CREATE INDEX IF NOT EXISTS idx_dpe_mp_payment ON public.driver_payment_events(mp_payment_id);
