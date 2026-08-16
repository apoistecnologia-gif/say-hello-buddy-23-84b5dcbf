-- APOIS Corridas — provider compatibility for the Woovi migration.
-- Preserve historical Asaas Pix rows while allowing new Woovi charges.
-- This migration changes only the provider CHECK; it does not rewrite payment data.

alter table public.ride_pix_payments
  drop constraint if exists ride_pix_payments_provider_check;

alter table public.ride_pix_payments
  add constraint ride_pix_payments_provider_check
  check (provider in ('asaas', 'woovi'));

comment on constraint ride_pix_payments_provider_check on public.ride_pix_payments is
  'Allows historical Asaas Pix receipts and the canonical Woovi Pix provider during migration/reconciliation.';
