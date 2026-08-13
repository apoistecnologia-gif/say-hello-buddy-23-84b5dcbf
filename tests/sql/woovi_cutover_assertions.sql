\set ON_ERROR_STOP on

-- Fee contract: 0.80%, floor R$0.50, cap R$5.00, grossed-up over passenger total.
do $$
begin
  if private.calculate_pix_processing_fee_cents(2000) <> 50 then raise exception 'fee_minimum_mismatch'; end if;
  if private.calculate_pix_processing_fee_cents(7000) <> 57 then raise exception 'fee_gross_up_mismatch'; end if;
  if private.calculate_pix_processing_fee_cents(10000) <> 81 then raise exception 'fee_percentage_mismatch'; end if;
  if private.calculate_pix_processing_fee_cents(100000) <> 500 then raise exception 'fee_cap_mismatch'; end if;
end $$;

-- Existing Asaas ride must never acquire a retroactive passenger processing fee.
update public.rides
set estimated_price=estimated_price
where id='11111111-1111-4111-8111-111111111111';

do $$
declare
  r public.rides%rowtype;
begin
  select * into r from public.rides where id='11111111-1111-4111-8111-111111111111';
  if r.payment_provider <> 'asaas' then raise exception 'legacy_provider_changed:%',r.payment_provider; end if;
  if r.processing_fee_cents <> 0 then raise exception 'legacy_processing_fee_added:%',r.processing_fee_cents; end if;
  if r.passenger_charge_cents <> 2000 then raise exception 'legacy_charge_changed:%',r.passenger_charge_cents; end if;
end $$;

-- A new Pix ride must be priced for Woovi server-side, including passenger fee.
insert into public.rides(
  id,passenger_id,driver_id,estimated_price,final_price,payment_method,
  payment_status,provider_payment_id,status,completed_at
) values (
  '22222222-2222-4222-8222-222222222222',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  20.00,20.00,'pix','paid','apois-ride-22222222-2222-4222-8222-222222222222-1','finalizada',now()
);

do $$
declare
  r public.rides%rowtype;
begin
  select * into r from public.rides where id='22222222-2222-4222-8222-222222222222';
  if r.payment_provider <> 'woovi' then raise exception 'new_pix_provider_mismatch:%',r.payment_provider; end if;
  if r.processing_fee_cents <> 50 then raise exception 'new_pix_fee_mismatch:%',r.processing_fee_cents; end if;
  if r.passenger_charge_cents <> 2050 then raise exception 'new_pix_total_mismatch:%',r.passenger_charge_cents; end if;
end $$;

insert into public.ride_pix_payments(
  ride_id,provider,provider_payment_id,amount_cents,provider_fee_cents,status,attempt_number
) values (
  '22222222-2222-4222-8222-222222222222','woovi',
  'apois-ride-22222222-2222-4222-8222-222222222222-1',2050,50,'received',1
);

-- Settlement must preserve full driver fare, zero platform commission, real provider fee,
-- and keep Woovi funds pending until subaccount credit succeeds.
select public.ensure_ride_settlement('22222222-2222-4222-8222-222222222222');

do $$
declare
  s public.ride_settlements%rowtype;
  w public.driver_wallets%rowtype;
  c public.driver_provider_credits%rowtype;
begin
  select * into s from public.ride_settlements where ride_id='22222222-2222-4222-8222-222222222222';
  if s.payment_provider <> 'woovi' then raise exception 'settlement_provider_mismatch:%',s.payment_provider; end if;
  if s.passenger_charge <> 20.50 then raise exception 'settlement_passenger_charge_mismatch:%',s.passenger_charge; end if;
  if s.driver_earning <> 20.00 then raise exception 'settlement_driver_earning_mismatch:%',s.driver_earning; end if;
  if s.platform_fee <> 0 then raise exception 'settlement_platform_fee_not_zero:%',s.platform_fee; end if;
  if s.payment_provider_fee <> 0.50 then raise exception 'settlement_provider_fee_mismatch:%',s.payment_provider_fee; end if;

  select * into w from public.driver_wallets where driver_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  if w.balance <> 30.00 or w.available_balance <> 7.00 or w.pending_balance <> 23.00 then
    raise exception 'pending_wallet_mismatch balance=% available=% pending=%',w.balance,w.available_balance,w.pending_balance;
  end if;

  select * into c from public.driver_provider_credits where ride_id='22222222-2222-4222-8222-222222222222';
  if c.amount_cents <> 2000 or c.status <> 'pending' then raise exception 'provider_credit_outbox_mismatch'; end if;
end $$;

-- Provision a canonical destination + matching Woovi provider account.
insert into public.driver_payout_destinations(
  driver_id,pix_key,pix_key_type,holder_name,confirmed_at,payout_available_at
) values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd','driver-test@example.com','EMAIL','Motorista Teste APOIS',now()-interval '2 days',now()-interval '1 day'
);

insert into public.driver_payment_accounts(
  driver_id,provider,pix_key,provider_subaccount_id,status,verified_at
) values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd','woovi','driver-test@example.com','driver-test@example.com','active',now()
);

update public.driver_provider_credits c
set payment_account_id=a.id
from public.driver_payment_accounts a
where c.ride_id='22222222-2222-4222-8222-222222222222'
  and a.driver_id=c.driver_id and a.provider='woovi';

-- Claim exactly once, then provider confirmation moves only the ride amount pending->available.
do $$
declare
  c public.driver_provider_credits%rowtype;
  w public.driver_wallets%rowtype;
begin
  c := public.claim_driver_provider_credit('woovi');
  if c.id is null or c.status <> 'processing' then raise exception 'provider_credit_claim_failed'; end if;
  perform public.mark_driver_provider_credit_succeeded(c.id,'statement-credit-1');

  select * into w from public.driver_wallets where driver_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  if w.balance <> 30.00 or w.available_balance <> 27.00 or w.pending_balance <> 3.00 then
    raise exception 'provider_credit_wallet_mismatch balance=% available=% pending=%',w.balance,w.available_balance,w.pending_balance;
  end if;

  c := public.claim_driver_provider_credit('woovi');
  if c.id is not null then raise exception 'provider_credit_replayed:%',c.id; end if;
end $$;

-- Activate the provider switches only inside this ephemeral DB and verify both
-- Driver and Admin read the same provider configuration.
update public.app_settings set value='"woovi"'::jsonb where key='finance.target_electronic_payment_provider';
update public.app_settings set value='"woovi"'::jsonb where key='finance.target_payout_provider';
update public.app_settings set value='true'::jsonb where key='finance.driver_payouts_enabled';

do $$
declare
  d jsonb;
  a jsonb;
begin
  d := public.get_driver_financial_dashboard(now()-interval '7 days',now()+interval '1 minute');
  if d #>> '{wallet,pending_balance_cents}' <> '300' then raise exception 'dashboard_pending_mismatch:%',d #>> '{wallet,pending_balance_cents}'; end if;
  if d #>> '{payout,provider}' <> 'woovi' then raise exception 'dashboard_provider_mismatch:%',d #>> '{payout,provider}'; end if;
  if d #>> '{payout,enabled}' <> 'true' then raise exception 'dashboard_payout_not_enabled:%',d #>> '{payout,reason}'; end if;

  a := public.admin_get_finance_summary(now()-interval '7 days',now()+interval '1 minute');
  if a #>> '{providers,electronic_payment_provider}' <> 'woovi' then raise exception 'admin_payment_provider_mismatch'; end if;
  if a #>> '{providers,payout_provider}' <> 'woovi' then raise exception 'admin_payout_provider_mismatch'; end if;
end $$;

-- Stable public withdrawal facade must reserve wallet funds idempotently for Woovi.
do $$
declare
  first_result jsonb;
  second_result jsonb;
  w public.driver_wallets%rowtype;
  wd public.driver_withdrawals%rowtype;
  k uuid := '33333333-3333-4333-8333-333333333333';
begin
  first_result := public.driver_request_withdrawal(2000,k);
  second_result := public.driver_request_withdrawal(2000,k);
  if first_result #>> '{provider}' <> 'woovi' then raise exception 'withdrawal_provider_mismatch'; end if;
  if second_result #>> '{idempotent}' <> 'true' then raise exception 'withdrawal_not_idempotent'; end if;

  select * into wd from public.driver_withdrawals where idempotency_key=k;
  if wd.status <> 'pending' or wd.provider <> 'woovi' or wd.amount <> 20.00 then raise exception 'withdrawal_row_mismatch'; end if;

  select * into w from public.driver_wallets where driver_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  if w.balance <> 10.00 or w.available_balance <> 7.00 or w.pending_balance <> 3.00 then
    raise exception 'withdrawal_wallet_reservation_mismatch balance=% available=% pending=%',w.balance,w.available_balance,w.pending_balance;
  end if;

  perform public.mark_driver_withdrawal_failed(wd.id,'test_failure','{}'::jsonb);
  select * into w from public.driver_wallets where driver_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  if w.balance <> 30.00 or w.available_balance <> 27.00 or w.pending_balance <> 3.00 then
    raise exception 'withdrawal_refund_mismatch balance=% available=% pending=%',w.balance,w.available_balance,w.pending_balance;
  end if;
end $$;

select 'APOIS_WOOVI_CUTOVER_SQL_OK' as result;
