-- APOIS Corridas — Woovi/OpenPix prepaid Pix model.
-- Passenger pays fare + transparent processing fee before dispatch.
-- Driver earning remains the ride fare; APOIS per-ride commission is zero.
-- The Pix charge is created on the APOIS master account because the driver
-- is not known yet. After completion, a provider-credit queue moves the
-- driver earning to the driver's Woovi subaccount idempotently.

alter table public.rides
  add column if not exists processing_fee_cents bigint not null default 0,
  add column if not exists passenger_charge_cents bigint;

alter table public.rides drop constraint if exists rides_processing_fee_cents_check;
alter table public.rides
  add constraint rides_processing_fee_cents_check check (processing_fee_cents >= 0);

alter table public.rides drop constraint if exists rides_passenger_charge_cents_check;
alter table public.rides
  add constraint rides_passenger_charge_cents_check check (
    passenger_charge_cents is null or passenger_charge_cents >= 0
  );

comment on column public.rides.processing_fee_cents is
  'Passenger-facing Taxa de processamento, calculated server-side in integer cents.';
comment on column public.rides.passenger_charge_cents is
  'Authoritative total charged to passenger in cents (fare + processing fee for Pix).';

create table if not exists public.driver_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  provider text not null,
  pix_key text not null,
  provider_subaccount_id text,
  status text not null default 'pending',
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_payment_accounts_provider_check check (provider in ('woovi')),
  constraint driver_payment_accounts_status_check check (status in ('pending','active','blocked','rejected')),
  constraint driver_payment_accounts_pix_key_not_blank check (btrim(pix_key) <> ''),
  unique(driver_id, provider),
  unique(provider, pix_key)
);

alter table public.driver_payment_accounts enable row level security;
revoke all on table public.driver_payment_accounts from anon, authenticated;
grant all on table public.driver_payment_accounts to service_role;

comment on table public.driver_payment_accounts is
  'Private payout destination for driver provider subaccounts. Never expose Pix keys to passengers.';

create table if not exists public.driver_provider_credits (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  payment_account_id uuid references public.driver_payment_accounts(id) on delete restrict,
  provider text not null,
  amount_cents bigint not null,
  status text not null default 'pending',
  idempotency_key text not null,
  provider_operation_id text,
  attempt_count integer not null default 0,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_provider_credits_provider_check check (provider in ('woovi')),
  constraint driver_provider_credits_amount_check check (amount_cents > 0),
  constraint driver_provider_credits_status_check check (status in ('pending','processing','succeeded','failed','cancelled')),
  unique(ride_id, provider),
  unique(idempotency_key)
);

create index if not exists driver_provider_credits_pending_idx
  on public.driver_provider_credits(status, created_at)
  where status in ('pending','failed');

alter table public.driver_provider_credits enable row level security;
revoke all on table public.driver_provider_credits from anon, authenticated;
grant all on table public.driver_provider_credits to service_role;

comment on table public.driver_provider_credits is
  'Idempotent outbox for crediting completed ride earnings to Woovi driver subaccounts.';

create or replace function public.activate_prepaid_pix_ride(
  _ride_id uuid,
  _provider_payment_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ride public.rides%rowtype;
  v_payment public.ride_pix_payments%rowtype;
  v_expected_cents bigint;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  if _ride_id is null or nullif(btrim(_provider_payment_id),'') is null then
    raise exception 'invalid_payment_identity' using errcode='22023';
  end if;

  select * into v_ride from public.rides where id=_ride_id for update;
  if not found then raise exception 'ride_not_found' using errcode='P0002'; end if;
  if lower(coalesce(v_ride.payment_method,'')) <> 'pix' then
    raise exception 'ride_payment_method_not_pix' using errcode='22023';
  end if;

  select * into v_payment
  from public.ride_pix_payments
  where ride_id=_ride_id and provider_payment_id=_provider_payment_id
  for update;
  if not found then raise exception 'ride_pix_payment_not_found' using errcode='P0002'; end if;
  if v_payment.status <> 'received' then
    raise exception 'ride_pix_payment_not_received' using errcode='55000';
  end if;

  v_expected_cents := coalesce(
    v_ride.passenger_charge_cents,
    round(v_ride.estimated_price * 100)::bigint
  );
  if v_payment.amount_cents <> v_expected_cents then
    raise exception 'ride_pix_amount_mismatch' using errcode='22023';
  end if;

  if v_ride.provider_payment_id is not null
     and v_ride.provider_payment_id <> _provider_payment_id then
    return jsonb_build_object(
      'ok', true,
      'stale_payment', true,
      'ride_id', v_ride.id,
      'status', v_ride.status,
      'payment_status', v_ride.payment_status
    );
  end if;

  if v_ride.payment_status = 'paid' then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'ride_id', v_ride.id,
      'status', v_ride.status,
      'payment_status', v_ride.payment_status,
      'should_dispatch', (v_ride.status='procurar_motorista' and coalesce(v_ride.dispatch_attempts,0)=0)
    );
  end if;

  if v_ride.status <> 'aguardando_pagamento' then
    raise exception 'ride_not_awaiting_payment' using errcode='55000';
  end if;

  update public.rides
  set payment_status='paid',
      payment_provider='woovi',
      provider_payment_id=_provider_payment_id,
      payment_confirmed_at=coalesce(payment_confirmed_at,now()),
      status='procurar_motorista',
      search_expires_at=now()+interval '180 seconds',
      updated_at=now()
  where id=_ride_id
  returning * into v_ride;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'transitioned', true,
    'ride_id', v_ride.id,
    'status', v_ride.status,
    'payment_status', v_ride.payment_status,
    'should_dispatch', true
  );
end;
$$;
revoke all on function public.activate_prepaid_pix_ride(uuid,text) from public, anon, authenticated;
grant execute on function public.activate_prepaid_pix_ride(uuid,text) to service_role;

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

    insert into public.driver_wallets(driver_id,balance,available_balance,created_at,updated_at)
    values(v_ride.driver_id,0,0,now(),now())
    on conflict(driver_id) do nothing;

    insert into public.driver_wallet_transactions(driver_id,amount,direction,source,source_id,description)
    values(v_ride.driver_id,v_amount,'credit','ride',v_ride.id,'Corrida Pix pré-paga concluída — 100% para o motorista')
    on conflict(driver_id,source,source_id) do nothing
    returning id into v_inserted_tx;

    if v_inserted_tx is not null then
      update public.driver_wallets
      set balance=balance+v_amount,
          available_balance=available_balance+v_amount,
          updated_at=now()
      where driver_id=v_ride.driver_id;
    end if;

    select * into v_payment_account
    from public.driver_payment_accounts
    where driver_id=v_ride.driver_id and provider='woovi' and status='active'
    limit 1;

    if found then
      insert into public.driver_provider_credits(
        ride_id, driver_id, payment_account_id, provider, amount_cents,
        status, idempotency_key, created_at, updated_at
      ) values (
        v_ride.id, v_ride.driver_id, v_payment_account.id, 'woovi', v_driver_earning_cents,
        'pending', 'woovi:ride-credit:' || v_ride.id::text, now(), now()
      ) on conflict(ride_id,provider) do nothing;
    end if;
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

comment on function public.ensure_ride_settlement(uuid) is
  'Creates canonical settlement: passenger charge includes processing fee, platform commission is zero, driver earning is the full ride fare, and Woovi subaccount credit is queued idempotently.';
