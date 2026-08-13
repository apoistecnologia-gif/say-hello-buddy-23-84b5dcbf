-- APOIS Corridas — Woovi foundation compatibility verifier.
--
-- The actual safe foundation is sequenced at 20260812165500 so the 17xx
-- hardening migrations compile in natural chronological order. This later
-- migration intentionally performs verification only. It must NOT redefine
-- provider gates or payment-breakdown functions after the 2115 cutover guard.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='rides' and column_name='processing_fee_cents'
  ) then
    raise exception 'woovi_foundation_processing_fee_column_missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='rides' and column_name='passenger_charge_cents'
  ) then
    raise exception 'woovi_foundation_passenger_charge_column_missing';
  end if;

  if to_regclass('public.driver_payment_accounts') is null then
    raise exception 'woovi_foundation_driver_payment_accounts_missing';
  end if;

  if to_regclass('public.driver_provider_credits') is null then
    raise exception 'woovi_foundation_driver_provider_credits_missing';
  end if;

  if to_regprocedure('private.calculate_pix_processing_fee_cents(bigint)') is null then
    raise exception 'woovi_foundation_fee_function_missing';
  end if;

  if to_regprocedure('private.enforce_ride_payment_breakdown()') is null then
    raise exception 'woovi_foundation_payment_breakdown_guard_missing';
  end if;

  if to_regprocedure('private.enforce_new_ride_pix_provider()') is null then
    raise exception 'woovi_foundation_provider_gate_missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname='trg_enforce_ride_payment_breakdown' and not tgisinternal
  ) then
    raise exception 'woovi_foundation_payment_breakdown_trigger_missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname='trg_enforce_new_ride_pix_provider' and not tgisinternal
  ) then
    raise exception 'woovi_foundation_provider_gate_trigger_missing';
  end if;
end $$;

comment on function private.enforce_ride_payment_breakdown() is
  'Server-authoritative fare/payment breakdown. Foundation installed at 1655; final staged provider guard preserved from 2115.';

comment on function private.enforce_new_ride_pix_provider() is
  'Fresh Pix attempts must follow finance.target_electronic_payment_provider; verified after final cutover guard.';
