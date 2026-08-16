-- APOIS Corridas — provider-backed wallet availability.
-- A completed Pix ride creates an accounting entitlement immediately, but the
-- amount only becomes withdrawable after Woovi confirms the credit to the
-- driver's subaccount.

alter table public.driver_wallets
  add column if not exists pending_balance numeric(12,2) not null default 0;

alter table public.driver_wallets drop constraint if exists driver_wallets_pending_balance_nonnegative;
alter table public.driver_wallets
  add constraint driver_wallets_pending_balance_nonnegative check (pending_balance >= 0);

comment on column public.driver_wallets.pending_balance is
  'Driver earnings already settled by APOIS but not yet confirmed in the external payout subaccount.';

create or replace function public.claim_driver_provider_credit(_provider text default 'woovi')
returns public.driver_provider_credits
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_credit public.driver_provider_credits%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;

  select c.* into v_credit
  from public.driver_provider_credits c
  join public.driver_payment_accounts a
    on a.id=c.payment_account_id
   and a.driver_id=c.driver_id
   and a.provider=c.provider
   and a.status='active'
  where c.provider = _provider
    and (
      c.status = 'pending'
      or (c.status = 'failed' and c.attempt_count < 5)
      or (c.status = 'processing' and c.updated_at < now() - interval '5 minutes')
    )
  order by c.created_at asc
  for update of c skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.driver_provider_credits
  set status = 'processing',
      attempt_count = attempt_count + 1,
      last_error = null,
      updated_at = now()
  where id = v_credit.id
  returning * into v_credit;

  return v_credit;
end;
$$;
revoke all on function public.claim_driver_provider_credit(text) from public, anon, authenticated;
grant execute on function public.claim_driver_provider_credit(text) to service_role;

create or replace function public.mark_driver_provider_credit_succeeded(
  _credit_id uuid,
  _provider_operation_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credit public.driver_provider_credits%rowtype;
  v_amount numeric(12,2);
  v_wallet public.driver_wallets%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;

  select * into v_credit
  from public.driver_provider_credits
  where id=_credit_id
  for update;
  if v_credit.id is null then
    raise exception 'provider_credit_not_found' using errcode='P0002';
  end if;
  if v_credit.status='succeeded' then return; end if;
  if v_credit.status <> 'processing' then
    raise exception 'provider_credit_not_processing' using errcode='55000';
  end if;

  v_amount := round(v_credit.amount_cents::numeric / 100.0, 2);
  select * into v_wallet
  from public.driver_wallets
  where driver_id=v_credit.driver_id
  for update;
  if v_wallet.driver_id is null then
    raise exception 'driver_wallet_not_found' using errcode='P0002';
  end if;
  if v_wallet.pending_balance < v_amount then
    raise exception 'driver_pending_balance_mismatch' using errcode='55000';
  end if;

  update public.driver_provider_credits
  set status='succeeded',
      provider_operation_id=nullif(btrim(coalesce(_provider_operation_id,'')),''),
      processed_at=coalesce(processed_at,now()),
      last_error=null,
      updated_at=now()
  where id=v_credit.id;

  update public.driver_wallets
  set pending_balance=pending_balance-v_amount,
      available_balance=available_balance+v_amount,
      updated_at=now()
  where driver_id=v_credit.driver_id;
end;
$$;
revoke all on function public.mark_driver_provider_credit_succeeded(uuid,text) from public,anon,authenticated;
grant execute on function public.mark_driver_provider_credit_succeeded(uuid,text) to service_role;

create or replace function public.ensure_ride_settlement(_ride_id uuid)
returns public.ride_settlements
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_ride public.rides%rowtype;
  v_settlement public.ride_settlements%rowtype;
  v_payment public.ride_pix_payments%rowtype;
  v_payment_account public.driver_payment_accounts%rowtype;
  v_amount numeric(12,2);
  v_payment_method text;
  v_payment_status text;
  v_inserted_tx uuid;
  v_provider_fee numeric(12,2) := 0;
  v_passenger_charge numeric(12,2);
  v_driver_earning_cents bigint;
begin
  select * into v_ride
  from public.rides
  where id = _ride_id
  for share;

  if not found then raise exception 'ride_not_found'; end if;
  if v_ride.status::text <> 'finalizada' then raise exception 'ride_not_completed'; end if;
  if v_ride.driver_id is null then raise exception 'ride_driver_missing'; end if;

  v_amount := coalesce(v_ride.final_price, v_ride.estimated_price);
  if v_amount is null or v_amount <= 0 then raise exception 'invalid_completed_ride_amount'; end if;
  v_driver_earning_cents := round(v_amount * 100)::bigint;

  v_payment_method := lower(trim(coalesce(v_ride.payment_method, '')));
  if v_payment_method = '' then raise exception 'ride_payment_method_missing'; end if;

  if v_payment_method = 'pix' then
    if v_ride.payment_status <> 'paid' or v_ride.payment_provider <> 'woovi' or v_ride.provider_payment_id is null then
      raise exception 'prepaid_pix_not_confirmed';
    end if;

    select * into v_payment
    from public.ride_pix_payments
    where ride_id = v_ride.id
      and provider_payment_id = v_ride.provider_payment_id
      and status = 'received'
    order by attempt_number desc
    limit 1;
    if not found then raise exception 'prepaid_pix_receipt_missing'; end if;

    if v_payment.amount_cents <> coalesce(v_ride.passenger_charge_cents, v_driver_earning_cents) then
      raise exception 'prepaid_pix_amount_mismatch';
    end if;

    v_passenger_charge := round(v_payment.amount_cents::numeric / 100, 2);
    v_provider_fee := round(coalesce(v_payment.provider_fee_cents,0)::numeric / 100, 2);

    insert into public.ride_settlements (
      ride_id, passenger_id, driver_id, gross_amount, discount_amount,
      passenger_charge, platform_fee, driver_earning, payment_provider_fee,
      cash_amount, wallet_amount, refunded_amount,
      payment_method, payment_provider, provider_payment_id,
      payment_status, status, settled_at, created_at, updated_at
    ) values (
      v_ride.id, v_ride.passenger_id, v_ride.driver_id, v_amount, 0,
      v_passenger_charge, 0, v_amount, v_provider_fee,
      0, 0, 0,
      'pix', 'woovi', v_ride.provider_payment_id,
      'confirmed', 'settled', now(), coalesce(v_ride.completed_at,now()), now()
    )
    on conflict (ride_id) do update set
      driver_id = excluded.driver_id,
      gross_amount = excluded.gross_amount,
      passenger_charge = excluded.passenger_charge,
      platform_fee = 0,
      driver_earning = excluded.driver_earning,
      payment_provider_fee = excluded.payment_provider_fee,
      payment_method = 'pix',
      payment_provider = 'woovi',
      provider_payment_id = excluded.provider_payment_id,
      payment_status = 'confirmed',
      status = 'settled',
      settled_at = coalesce(public.ride_settlements.settled_at,now()),
      updated_at = now();

    insert into public.driver_wallets(driver_id,balance,available_balance,pending_balance,created_at,updated_at)
    values(v_ride.driver_id,0,0,0,now(),now())
    on conflict(driver_id) do nothing;

    insert into public.driver_wallet_transactions(driver_id,amount,direction,source,source_id,description)
    values(v_ride.driver_id,v_amount,'credit','ride',v_ride.id,'Corrida Pix pré-paga concluída — aguardando crédito Woovi')
    on conflict(driver_id,source,source_id) do nothing
    returning id into v_inserted_tx;

    if v_inserted_tx is not null then
      update public.driver_wallets
      set balance=balance+v_amount,
          pending_balance=pending_balance+v_amount,
          updated_at=now()
      where driver_id=v_ride.driver_id;
    end if;

    select * into v_payment_account
    from public.driver_payment_accounts
    where driver_id=v_ride.driver_id and provider='woovi' and status='active'
    limit 1;

    insert into public.driver_provider_credits(
      ride_id, driver_id, payment_account_id, provider, amount_cents,
      status, idempotency_key, created_at, updated_at
    ) values (
      v_ride.id,
      v_ride.driver_id,
      case when v_payment_account.id is null then null else v_payment_account.id end,
      'woovi',
      v_driver_earning_cents,
      'pending',
      'woovi:ride-credit:' || v_ride.id::text,
      now(),
      now()
    ) on conflict(ride_id,provider) do nothing;
  else
    v_payment_status := case
      when v_payment_method in ('cash','dinheiro','money') then 'cash_pending'
      else 'pending'
    end;

    insert into public.ride_settlements (
      ride_id, passenger_id, driver_id, gross_amount, passenger_charge,
      payment_method, payment_status, status, created_at, updated_at
    ) values (
      v_ride.id, v_ride.passenger_id, v_ride.driver_id, v_amount, v_amount,
      v_payment_method, v_payment_status, 'awaiting_payment',
      coalesce(v_ride.completed_at, now()), now()
    )
    on conflict (ride_id) do nothing;
  end if;

  select * into v_settlement
  from public.ride_settlements
  where ride_id = v_ride.id;
  return v_settlement;
end;
$$;

revoke all on function public.ensure_ride_settlement(uuid) from public, anon, authenticated;
grant execute on function public.ensure_ride_settlement(uuid) to service_role;

comment on function public.mark_driver_provider_credit_succeeded(uuid,text) is
  'Moves one idempotent completed-ride earning from pending to available only after Woovi subaccount credit succeeds.';
