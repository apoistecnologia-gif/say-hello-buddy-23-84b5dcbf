
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS asaas_customer_id text;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS asaas_payment_id text,
  ADD COLUMN IF NOT EXISTS pix_qr_code text,
  ADD COLUMN IF NOT EXISTS pix_copy_paste text,
  ADD COLUMN IF NOT EXISTS invoice_url text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

CREATE INDEX IF NOT EXISTS subscriptions_asaas_payment_id_idx
  ON public.subscriptions (asaas_payment_id);

CREATE INDEX IF NOT EXISTS subscriptions_provider_reference_idx
  ON public.subscriptions (provider_reference);

INSERT INTO public.payment_gateways (provider, display_name, enabled, mode, api_key_secret_name, webhook_url, extra)
VALUES ('asaas', 'Asaas', false, 'sandbox', 'ASAAS_API_KEY', '/api/public/asaas-webhook', '{}'::jsonb)
ON CONFLICT DO NOTHING;
