ALTER TABLE public.ride_pix_payments
  DROP CONSTRAINT IF EXISTS ride_pix_payments_provider_check;

ALTER TABLE public.ride_pix_payments
  ADD CONSTRAINT ride_pix_payments_provider_check
  CHECK (provider = ANY (ARRAY['asaas'::text, 'woovi'::text, 'pagbank'::text]));
