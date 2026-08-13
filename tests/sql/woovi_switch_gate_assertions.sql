\set ON_ERROR_STOP on

-- Schema may be installed while production still targets Asaas.
update public.app_settings
set value='"asaas"'::jsonb
where key='finance.target_electronic_payment_provider';

insert into public.rides(
  id,passenger_id,driver_id,estimated_price,final_price,payment_method,
  payment_status,status
) values (
  '44444444-4444-4444-8444-444444444444',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  20.00,20.00,'pix','pending','aguardando_pagamento'
);

do $$
declare
  r public.rides%rowtype;
begin
  select * into r from public.rides where id='44444444-4444-4444-8444-444444444444';
  if r.payment_provider <> 'asaas' then raise exception 'pre_switch_provider_changed:%',r.payment_provider; end if;
  if r.processing_fee_cents <> 0 then raise exception 'pre_switch_fee_added:%',r.processing_fee_cents; end if;
  if r.passenger_charge_cents <> 2000 then raise exception 'pre_switch_total_changed:%',r.passenger_charge_cents; end if;
end $$;

-- While Asaas is active, an Asaas attempt is accepted and a fresh Woovi attempt
-- is rejected by the database itself.
insert into public.ride_pix_payments(
  ride_id,provider,provider_payment_id,amount_cents,status,attempt_number
) values (
  '44444444-4444-4444-8444-444444444444','asaas','pre-switch-asaas-1',2000,'pending',1
);

do $$
begin
  begin
    insert into public.ride_pix_payments(
      ride_id,provider,provider_payment_id,amount_cents,status,attempt_number
    ) values (
      '44444444-4444-4444-8444-444444444444','woovi','pre-switch-woovi-1',2000,'pending',2
    );
    raise exception 'inactive_woovi_insert_was_accepted';
  exception
    when sqlstate '55000' then
      if sqlerrm <> 'electronic_payment_provider_not_active' then raise; end if;
  end;
end $$;

-- Only the explicit switch activates Woovi + passenger processing fee.
update public.app_settings
set value='"woovi"'::jsonb
where key='finance.target_electronic_payment_provider';

insert into public.rides(
  id,passenger_id,driver_id,estimated_price,final_price,payment_method,
  payment_status,status
) values (
  '55555555-5555-4555-8555-555555555555',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  20.00,20.00,'pix','pending','aguardando_pagamento'
);

do $$
declare
  r public.rides%rowtype;
  legacy public.rides%rowtype;
begin
  select * into r from public.rides where id='55555555-5555-4555-8555-555555555555';
  if r.payment_provider <> 'woovi' then raise exception 'post_switch_provider_mismatch:%',r.payment_provider; end if;
  if r.processing_fee_cents <> 50 then raise exception 'post_switch_fee_mismatch:%',r.processing_fee_cents; end if;
  if r.passenger_charge_cents <> 2050 then raise exception 'post_switch_total_mismatch:%',r.passenger_charge_cents; end if;

  -- Updating an already provider-bound legacy row must never migrate it silently.
  update public.rides set estimated_price=estimated_price
  where id='11111111-1111-4111-8111-111111111111';
  select * into legacy from public.rides where id='11111111-1111-4111-8111-111111111111';
  if legacy.payment_provider <> 'asaas' or legacy.processing_fee_cents <> 0 or legacy.passenger_charge_cents <> 2000 then
    raise exception 'legacy_row_changed_after_switch';
  end if;
end $$;

-- After the switch, a fresh Asaas attempt is rejected even if an old APK still
-- calls the legacy endpoint. A Woovi attempt for the Woovi-priced ride succeeds.
do $$
begin
  begin
    insert into public.ride_pix_payments(
      ride_id,provider,provider_payment_id,amount_cents,status,attempt_number
    ) values (
      '55555555-5555-4555-8555-555555555555','asaas','post-switch-asaas-1',2050,'pending',1
    );
    raise exception 'inactive_asaas_insert_was_accepted';
  exception
    when sqlstate '55000' then
      if sqlerrm <> 'electronic_payment_provider_not_active' then raise; end if;
  end;
end $$;

insert into public.ride_pix_payments(
  ride_id,provider,provider_payment_id,amount_cents,status,attempt_number
) values (
  '55555555-5555-4555-8555-555555555555','woovi','post-switch-woovi-1',2050,'pending',1
);

do $$
declare
  legacy_count integer;
  woovi_count integer;
begin
  select count(*) into legacy_count
  from public.ride_pix_payments
  where ride_id='44444444-4444-4444-8444-444444444444' and provider='asaas';
  if legacy_count <> 1 then raise exception 'pre_switch_asaas_attempt_changed:%',legacy_count; end if;

  select count(*) into woovi_count
  from public.ride_pix_payments
  where ride_id='55555555-5555-4555-8555-555555555555' and provider='woovi';
  if woovi_count <> 1 then raise exception 'post_switch_woovi_attempt_missing:%',woovi_count; end if;
end $$;

select 'APOIS_WOOVI_PROVIDER_SWITCH_GATE_OK' as result;
