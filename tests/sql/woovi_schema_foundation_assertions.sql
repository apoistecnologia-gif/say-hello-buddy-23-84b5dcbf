\set ON_ERROR_STOP on

-- Foundation is installed with the existing production switch still on Asaas.
do $$
declare
  target text;
begin
  select value #>> '{}' into target
  from public.app_settings
  where key='finance.target_electronic_payment_provider';
  if target <> 'asaas' then raise exception 'fixture_provider_not_asaas:%',target; end if;
end $$;

-- Required Woovi schema exists without activating Woovi traffic.
do $$
begin
  if not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='rides' and column_name='processing_fee_cents'
  ) then raise exception 'processing_fee_column_missing'; end if;

  if not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='rides' and column_name='passenger_charge_cents'
  ) then raise exception 'passenger_charge_column_missing'; end if;

  if to_regclass('public.driver_payment_accounts') is null then raise exception 'driver_payment_accounts_missing'; end if;
  if to_regclass('public.driver_provider_credits') is null then raise exception 'driver_provider_credits_missing'; end if;
end $$;

-- Historical Asaas ride remains unchanged.
do $$
declare
  r public.rides%rowtype;
begin
  select * into r from public.rides where id='11111111-1111-4111-8111-111111111111';
  if r.payment_provider <> 'asaas' then raise exception 'legacy_provider_changed:%',r.payment_provider; end if;
  if r.processing_fee_cents <> 0 then raise exception 'legacy_fee_changed:%',r.processing_fee_cents; end if;
  if r.passenger_charge_cents <> 2000 then raise exception 'legacy_total_changed:%',r.passenger_charge_cents; end if;
end $$;

-- A new Pix ride still follows Asaas and therefore receives no Woovi processing fee.
insert into public.rides(
  id,passenger_id,driver_id,estimated_price,final_price,payment_method,
  payment_status,status
) values (
  '66666666-6666-4666-8666-666666666666',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  20.00,20.00,'pix','pending','aguardando_pagamento'
);

do $$
declare
  r public.rides%rowtype;
begin
  select * into r from public.rides where id='66666666-6666-4666-8666-666666666666';
  if r.payment_provider <> 'asaas' then raise exception 'foundation_switched_provider:%',r.payment_provider; end if;
  if r.processing_fee_cents <> 0 then raise exception 'foundation_added_fee:%',r.processing_fee_cents; end if;
  if r.passenger_charge_cents <> 2000 then raise exception 'foundation_changed_total:%',r.passenger_charge_cents; end if;
end $$;

insert into public.ride_pix_payments(
  ride_id,provider,provider_payment_id,amount_cents,status,attempt_number
) values (
  '66666666-6666-4666-8666-666666666666','asaas','foundation-asaas-1',2000,'pending',1
);

-- Woovi cannot be inserted while Asaas is still the active switch.
do $$
begin
  begin
    insert into public.ride_pix_payments(
      ride_id,provider,provider_payment_id,amount_cents,status,attempt_number
    ) values (
      '66666666-6666-4666-8666-666666666666','woovi','foundation-woovi-1',2050,'pending',2
    );
    raise exception 'foundation_allowed_woovi_before_switch';
  exception
    when sqlstate '55000' then
      if sqlerrm <> 'electronic_payment_provider_not_active' then raise; end if;
  end;
end $$;

select 'APOIS_WOOVI_SCHEMA_FOUNDATION_SAFE_OK' as result;
