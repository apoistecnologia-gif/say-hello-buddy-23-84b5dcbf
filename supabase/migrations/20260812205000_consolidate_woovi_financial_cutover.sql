-- APOIS Corridas — canonical Asaas -> Woovi/OpenPix financial cutover.
--
-- This migration is intentionally written against the observed production
-- schema. It preserves the existing settlement/wallet/withdrawal ledger and
-- legacy Asaas rides, while preparing new ride Pix charges and driver payouts
-- for Woovi. It does NOT enable payouts and does NOT switch either operational
-- provider setting. Fresh Pix rides follow finance.target_electronic_payment_provider.

-- ---------------------------------------------------------------------------
-- 1. Passenger charge breakdown (server authoritative)
-- ---------------------------------------------------------------------------

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

-- All rows that already exist at cutover are legacy rows. Backfill them with
-- the historical fare only; never retroactively add a processing fee.
update public.rides
set processing_fee_cents = 0,
    passenger_charge_cents = round(estimated_price * 100)::bigint
where passenger_charge_cents is null
  and estimated_price is not null
  and estimated_price >= 0;

comment on column public.rides.processing_fee_cents is
  'Passenger-facing Taxa de processamento in integer cents. Server authoritative.';
comment on column public.rides.passenger_charge_cents is
  'Authoritative amount charged to passenger in cents. New Woovi Pix rides include processing fee.';

-- Keep historical Asaas rows and permit new Woovi rows.
alter table public.ride_pix_payments drop constraint if exists ride_pix_payments_provider_check;
alter table public.ride_pix_payments
  add constraint ride_pix_payments_provider_check check (provider in ('asaas','woovi'));

-- ---------------------------------------------------------------------------
-- 2. Existing payout destination remains the source of truth for the Pix key.
--    This table stores provider-account metadata only; pix_key is a verified
--    snapshot and must always match driver_payout_destinations.pix_key.
-- ---------------------------------------------------------------------------

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
  constraint driver_payment_accounts_pix_key_not_blank check (btrim(pix_key) <> '')
);

create unique index if not exists driver_payment_accounts_driver_provider_uidx
  on public.driver_payment_accounts(driver_id, provider);
create unique index if not exists driver_payment_accounts_provider_pix_uidx
  on public.driver_payment_accounts(provider, pix_key);

alter table public.driver_payment_accounts enable row level security;
revoke all on table public.driver_payment_accounts from anon, authenticated;
grant all on table public.driver_payment_accounts to service_role;

comment on table public.driver_payment_accounts is
  'Private provider-account binding. driver_payout_destinations remains authoritative for the driver Pix destination.';

-- Operational outbox: there is no equivalent legacy table for an asynchronous
-- main-account -> driver-subaccount credit, so this is the only new ledger-side
-- structure required by Woovi.
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

-- ---------------------------------------------------------------------------
-- 3. Preserve the existing anti-fraud Pix-destination RPC. When the Pix key is
--    changed, any Woovi binding is invalidated and must be recreated only after
--    the existing 24-hour cooldown.
-- ---------------------------------------------------------------------------

create or replace function apois_rpc_private.driver_set_payout_destination(
  _pix_key text,
  _pix_key_type text,
  _holder_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_driver_id uuid;
  v_type text := upper(btrim(coalesce(_pix_key_type, '')));
  v_key text := btrim(coalesce(_pix_key, ''));
  v_normalized text;
  v_previous public.driver_payout_destinations%rowtype;
  v_changed boolean := false;
  v_available_at timestamptz;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;

  select d.id into v_driver_id
  from public.drivers d
  where d.user_id = public.mobility_user_id()
  limit 1;
  if v_driver_id is null then raise exception 'driver_not_found' using errcode='P0002'; end if;

  if v_type not in ('CPF','CNPJ','EMAIL','PHONE','EVP') then
    raise exception 'invalid_pix_key_type' using errcode='22023';
  end if;

  if v_type in ('CPF','CNPJ','PHONE') then
    v_normalized := regexp_replace(v_key, '[^0-9+]', '', 'g');
  elsif v_type='EMAIL' then
    v_normalized := lower(v_key);
  else
    v_normalized := v_key;
  end if;

  if v_type='CPF' and regexp_replace(v_normalized, '[^0-9]', '', 'g') !~ '^[0-9]{11}$' then
    raise exception 'invalid_pix_cpf' using errcode='22023';
  elsif v_type='CNPJ' and regexp_replace(v_normalized, '[^0-9]', '', 'g') !~ '^[0-9]{14}$' then
    raise exception 'invalid_pix_cnpj' using errcode='22023';
  elsif v_type='EMAIL' and v_normalized !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid_pix_email' using errcode='22023';
  elsif v_type='PHONE' then
    v_normalized := regexp_replace(v_normalized, '[^0-9]', '', 'g');
    if v_normalized !~ '^[0-9]{10,13}$' then raise exception 'invalid_pix_phone' using errcode='22023'; end if;
  elsif v_type='EVP' and (length(v_normalized)<20 or length(v_normalized)>100) then
    raise exception 'invalid_pix_evp' using errcode='22023';
  end if;

  select * into v_previous
  from public.driver_payout_destinations
  where driver_id=v_driver_id
  for update;

  v_changed := v_previous.driver_id is null
    or v_previous.pix_key is distinct from v_normalized
    or v_previous.pix_key_type is distinct from v_type;
  v_available_at := case
    when v_changed then now()+interval '24 hours'
    else coalesce(v_previous.payout_available_at,now())
  end;

  insert into public.driver_payout_destinations(
    driver_id,pix_key,pix_key_type,holder_name,confirmed_at,payout_available_at,created_at,updated_at
  ) values (
    v_driver_id,v_normalized,v_type,nullif(btrim(coalesce(_holder_name,'')),''),now(),v_available_at,now(),now()
  )
  on conflict(driver_id) do update set
    pix_key=excluded.pix_key,
    pix_key_type=excluded.pix_key_type,
    holder_name=excluded.holder_name,
    confirmed_at=excluded.confirmed_at,
    payout_available_at=excluded.payout_available_at,
    updated_at=now();

  if v_changed then
    update public.driver_payment_accounts
    set pix_key=v_normalized,
        provider_subaccount_id=null,
        status='pending',
        verified_at=null,
        updated_at=now()
    where driver_id=v_driver_id and provider='woovi';
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(
    auth.uid(),
    case when v_changed then 'driver_payout_destination_changed' else 'driver_payout_destination_confirmed' end,
    'driver_payout_destination',
    v_driver_id::text,
    jsonb_build_object(
      'pix_key_type',v_type,
      'changed',v_changed,
      'payout_available_at',v_available_at,
      'woovi_binding_invalidated',v_changed
    )
  );

  return jsonb_build_object(
    'ok',true,
    'pixKeyType',v_type,
    'confirmedAt',now(),
    'payoutAvailableAt',v_available_at,
    'cooldownApplied',v_changed
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Canonical server-side processing fee for fresh Pix rides. The migration
--    is safe to install while Asaas remains active: provider selection is read
--    from finance.target_electronic_payment_provider instead of being implied
--    merely by installing this schema/runtime foundation.
-- ---------------------------------------------------------------------------

create or replace function private.calculate_pix_processing_fee_cents(_fare_cents bigint)
returns bigint
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_fare bigint := greatest(_fare_cents, 0);
  v_fee bigint := 50;
  v_next bigint;
  i integer;
begin
  for i in 1..16 loop
    v_next := least(500::bigint, greatest(50::bigint, ceil(((v_fare + v_fee)::numeric * 80) / 10000)::bigint));
    if v_next = v_fee then return v_fee; end if;
    v_fee := v_next;
  end loop;
  return v_fee;
end;
$$;

revoke all on function private.calculate_pix_processing_fee_cents(bigint) from public, anon, authenticated;
grant execute on function private.calculate_pix_processing_fee_cents(bigint) to service_role;

create or replace function private.enforce_ride_payment_breakdown()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fare_cents bigint;
  v_preserve_existing_provider boolean := false;
  v_target_provider text := 'asaas';
begin
  if new.estimated_price is null or new.estimated_price < 0 then return new; end if;
  v_fare_cents := round(new.estimated_price * 100)::bigint;

  if lower(coalesce(new.payment_method,'')) = 'pix' then
    if tg_op='UPDATE' then
      v_preserve_existing_provider := lower(coalesce(old.payment_provider,'')) in ('asaas','woovi')
        and (old.provider_payment_id is not null or old.payment_status='paid');
    end if;

    if v_preserve_existing_provider then
      new.payment_provider := lower(old.payment_provider);
      if lower(old.payment_provider)='woovi' then
        new.processing_fee_cents := coalesce(old.processing_fee_cents,private.calculate_pix_processing_fee_cents(v_fare_cents));
        new.passenger_charge_cents := coalesce(old.passenger_charge_cents,v_fare_cents+new.processing_fee_cents);
      else
        new.processing_fee_cents := 0;
        new.passenger_charge_cents := v_fare_cents;
      end if;
      return new;
    end if;

    select lower(coalesce(value #>> '{}','asaas')) into v_target_provider
    from public.app_settings
    where key='finance.target_electronic_payment_provider';
    v_target_provider := coalesce(v_target_provider,'asaas');

    if v_target_provider='woovi' then
      new.processing_fee_cents := private.calculate_pix_processing_fee_cents(v_fare_cents);
      new.passenger_charge_cents := v_fare_cents + new.processing_fee_cents;
      new.payment_provider := 'woovi';
    elsif v_target_provider='asaas' then
      new.processing_fee_cents := 0;
      new.passenger_charge_cents := v_fare_cents;
      new.payment_provider := 'asaas';
    else
      raise exception 'electronic_payment_provider_not_supported' using errcode='55000';
    end if;
  else
    new.processing_fee_cents := 0;
    new.passenger_charge_cents := v_fare_cents;
    if tg_op='INSERT' then new.payment_provider := null; end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_ride_payment_breakdown() from public, anon, authenticated;

drop trigger if exists trg_enforce_ride_payment_breakdown on public.rides;
create trigger trg_enforce_ride_payment_breakdown
before insert or update of estimated_price, payment_method on public.rides
for each row execute function private.enforce_ride_payment_breakdown();

-- ---------------------------------------------------------------------------
-- 5. Provider-aware prepaid Pix activation. Keep a two-argument wrapper for
--    the currently deployed Asaas webhook, but make it discover the provider
--    from ride_pix_payments instead of hardcoding Asaas.
-- ---------------------------------------------------------------------------

create or replace function public.activate_prepaid_pix_ride(
  _ride_id uuid,
  _provider_payment_id text,
  _provider text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ride public.rides%rowtype;
  v_payment public.ride_pix_payments%rowtype;
  v_provider text := lower(btrim(coalesce(_provider,'')));
  v_expected_cents bigint;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if _ride_id is null or nullif(btrim(_provider_payment_id),'') is null then
    raise exception 'invalid_payment_identity' using errcode='22023';
  end if;
  if v_provider not in ('asaas','woovi') then raise exception 'invalid_payment_provider' using errcode='22023'; end if;

  select * into v_ride from public.rides where id=_ride_id for update;
  if not found then raise exception 'ride_not_found' using errcode='P0002'; end if;
  if lower(coalesce(v_ride.payment_method,'')) <> 'pix' then raise exception 'ride_payment_method_not_pix' using errcode='22023'; end if;

  select * into v_payment
  from public.ride_pix_payments
  where ride_id=_ride_id
    and provider=v_provider
    and provider_payment_id=_provider_payment_id
  for update;
  if not found then raise exception 'ride_pix_payment_not_found' using errcode='P0002'; end if;
  if v_payment.status <> 'received' then raise exception 'ride_pix_payment_not_received' using errcode='55000'; end if;

  v_expected_cents := case
    when v_provider='woovi' then coalesce(v_ride.passenger_charge_cents, round(v_ride.estimated_price*100)::bigint)
    else round(v_ride.estimated_price*100)::bigint
  end;
  if v_payment.amount_cents <> v_expected_cents then raise exception 'ride_pix_amount_mismatch' using errcode='22023'; end if;

  if v_ride.provider_payment_id is not null and v_ride.provider_payment_id <> _provider_payment_id then
    return jsonb_build_object('ok',true,'stale_payment',true,'ride_id',v_ride.id,'status',v_ride.status,'payment_status',v_ride.payment_status);
  end if;

  if v_ride.payment_status='paid' then
    return jsonb_build_object(
      'ok',true,'duplicate',true,'ride_id',v_ride.id,'status',v_ride.status,
      'payment_status',v_ride.payment_status,
      'should_dispatch',(v_ride.status='procurar_motorista' and coalesce(v_ride.dispatch_attempts,0)=0)
    );
  end if;

  if v_ride.status <> 'aguardando_pagamento' then raise exception 'ride_not_awaiting_payment' using errcode='55000'; end if;

  update public.rides
  set payment_status='paid',
      payment_provider=v_provider,
      provider_payment_id=_provider_payment_id,
      payment_confirmed_at=coalesce(payment_confirmed_at,now()),
      status='procurar_motorista',
      search_expires_at=now()+interval '180 seconds',
      updated_at=now()
  where id=_ride_id
  returning * into v_ride;

  return jsonb_build_object(
    'ok',true,'duplicate',false,'transitioned',true,'ride_id',v_ride.id,
    'status',v_ride.status,'payment_status',v_ride.payment_status,'should_dispatch',true
  );
end;
$$;

revoke all on function public.activate_prepaid_pix_ride(uuid,text,text) from public, anon, authenticated;
grant execute on function public.activate_prepaid_pix_ride(uuid,text,text) to service_role;

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
  v_provider text;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;

  select provider into v_provider
  from public.ride_pix_payments
  where ride_id=_ride_id and provider_payment_id=_provider_payment_id
  limit 1;
  if v_provider is null then raise exception 'ride_pix_payment_not_found' using errcode='P0002'; end if;

  return public.activate_prepaid_pix_ride(_ride_id,_provider_payment_id,v_provider);
end;
$$;

revoke all on function public.activate_prepaid_pix_ride(uuid,text) from public, anon, authenticated;
grant execute on function public.activate_prepaid_pix_ride(uuid,text) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Provider-credit claim/success. Ambiguous processing operations are never
--    replayed automatically.
-- ---------------------------------------------------------------------------

alter table public.driver_wallets
  add column if not exists pending_balance numeric(12,2) not null default 0;
alter table public.driver_wallets drop constraint if exists driver_wallets_pending_balance_nonnegative;
alter table public.driver_wallets
  add constraint driver_wallets_pending_balance_nonnegative check (pending_balance >= 0);

create or replace function public.claim_driver_provider_credit(_provider text default 'woovi')
returns public.driver_provider_credits
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_credit public.driver_provider_credits%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;

  select c.* into v_credit
  from public.driver_provider_credits c
  join public.driver_payment_accounts a
    on a.id=c.payment_account_id
   and a.driver_id=c.driver_id
   and a.provider=c.provider
   and a.status='active'
  join public.driver_payout_destinations d
    on d.driver_id=c.driver_id
   and d.confirmed_at is not null
   and (d.payout_available_at is null or d.payout_available_at <= now())
   and d.pix_key=a.pix_key
  where c.provider=_provider
    and nullif(btrim(a.provider_subaccount_id),'') is not null
    and (
      c.status='pending'
      or (
        c.status='failed'
        and c.attempt_count < 5
        and coalesce(c.last_error,'') like 'safe_retry:%'
      )
    )
  order by c.created_at asc
  for update of c skip locked
  limit 1;

  if not found then return null; end if;

  update public.driver_provider_credits
  set status='processing',attempt_count=attempt_count+1,last_error=null,updated_at=now()
  where id=v_credit.id
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
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;

  select * into v_credit from public.driver_provider_credits where id=_credit_id for update;
  if v_credit.id is null then raise exception 'provider_credit_not_found' using errcode='P0002'; end if;
  if v_credit.status='succeeded' then return; end if;
  if v_credit.status <> 'processing' then raise exception 'provider_credit_not_processing' using errcode='55000'; end if;

  v_amount := round(v_credit.amount_cents::numeric / 100.0,2);
  select * into v_wallet from public.driver_wallets where driver_id=v_credit.driver_id for update;
  if v_wallet.driver_id is null then raise exception 'driver_wallet_not_found' using errcode='P0002'; end if;
  if v_wallet.pending_balance < v_amount then raise exception 'driver_pending_balance_mismatch' using errcode='55000'; end if;

  update public.driver_provider_credits
  set status='succeeded',
      provider_operation_id=nullif(btrim(coalesce(_provider_operation_id,'')),''),
      processed_at=coalesce(processed_at,now()),last_error=null,updated_at=now()
  where id=v_credit.id;

  update public.driver_wallets
  set pending_balance=pending_balance-v_amount,
      available_balance=available_balance+v_amount,
      updated_at=now()
  where driver_id=v_credit.driver_id;
end;
$$;

revoke all on function public.mark_driver_provider_credit_succeeded(uuid,text) from public, anon, authenticated;
grant execute on function public.mark_driver_provider_credit_succeeded(uuid,text) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Canonical settlement. Legacy Asaas rides remain completable. New Woovi
--    earnings are ledgered immediately but remain pending until subaccount
--    credit confirmation.
-- ---------------------------------------------------------------------------

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
  v_destination public.driver_payout_destinations%rowtype;
  v_amount numeric(12,2);
  v_payment_method text;
  v_payment_status text;
  v_provider text;
  v_inserted_tx uuid;
  v_provider_fee numeric(12,2) := 0;
  v_passenger_charge numeric(12,2);
  v_driver_earning_cents bigint;
  v_expected_payment_cents bigint;
begin
  select * into v_ride from public.rides where id=_ride_id for share;
  if not found then raise exception 'ride_not_found'; end if;
  if v_ride.status::text <> 'finalizada' then raise exception 'ride_not_completed'; end if;
  if v_ride.driver_id is null then raise exception 'ride_driver_missing'; end if;

  v_amount := coalesce(v_ride.final_price,v_ride.estimated_price);
  if v_amount is null or v_amount <= 0 then raise exception 'invalid_completed_ride_amount'; end if;
  v_driver_earning_cents := round(v_amount*100)::bigint;

  v_payment_method := lower(trim(coalesce(v_ride.payment_method,'')));
  if v_payment_method='' then raise exception 'ride_payment_method_missing'; end if;

  if v_payment_method='pix' then
    v_provider := lower(trim(coalesce(v_ride.payment_provider,'')));
    if v_ride.payment_status <> 'paid' or v_provider not in ('asaas','woovi') or v_ride.provider_payment_id is null then
      raise exception 'prepaid_pix_not_confirmed';
    end if;

    select * into v_payment
    from public.ride_pix_payments
    where ride_id=v_ride.id
      and provider=v_provider
      and provider_payment_id=v_ride.provider_payment_id
      and status='received'
    order by attempt_number desc
    limit 1;
    if not found then raise exception 'prepaid_pix_receipt_missing'; end if;

    v_expected_payment_cents := case
      when v_provider='woovi' then coalesce(v_ride.passenger_charge_cents,v_driver_earning_cents)
      else v_driver_earning_cents
    end;
    if v_payment.amount_cents <> v_expected_payment_cents then raise exception 'prepaid_pix_amount_mismatch'; end if;

    v_passenger_charge := round(v_payment.amount_cents::numeric/100,2);
    v_provider_fee := round(coalesce(v_payment.provider_fee_cents,0)::numeric/100,2);

    insert into public.ride_settlements(
      ride_id,passenger_id,driver_id,gross_amount,discount_amount,passenger_charge,
      platform_fee,driver_earning,payment_provider_fee,cash_amount,wallet_amount,
      refunded_amount,payment_method,payment_provider,provider_payment_id,
      payment_status,status,settled_at,created_at,updated_at
    ) values (
      v_ride.id,v_ride.passenger_id,v_ride.driver_id,v_amount,0,v_passenger_charge,
      0,v_amount,v_provider_fee,0,0,0,'pix',v_provider,v_ride.provider_payment_id,
      'confirmed','settled',now(),coalesce(v_ride.completed_at,now()),now()
    )
    on conflict(ride_id) do update set
      driver_id=excluded.driver_id,
      gross_amount=excluded.gross_amount,
      passenger_charge=excluded.passenger_charge,
      platform_fee=0,
      driver_earning=excluded.driver_earning,
      payment_provider_fee=excluded.payment_provider_fee,
      payment_method='pix',
      payment_provider=excluded.payment_provider,
      provider_payment_id=excluded.provider_payment_id,
      payment_status='confirmed',
      status='settled',
      settled_at=coalesce(public.ride_settlements.settled_at,now()),
      updated_at=now();

    insert into public.driver_wallets(driver_id,balance,available_balance,pending_balance,created_at,updated_at)
    values(v_ride.driver_id,0,0,0,now(),now())
    on conflict(driver_id) do nothing;

    insert into public.driver_wallet_transactions(driver_id,amount,direction,source,source_id,description)
    values(
      v_ride.driver_id,v_amount,'credit','ride',v_ride.id,
      case when v_provider='woovi'
        then 'Corrida Pix pré-paga concluída — aguardando crédito Woovi'
        else 'Corrida Pix pré-paga Asaas concluída'
      end
    )
    on conflict(driver_id,source,source_id) do nothing
    returning id into v_inserted_tx;

    if v_inserted_tx is not null then
      if v_provider='woovi' then
        update public.driver_wallets
        set balance=balance+v_amount,pending_balance=pending_balance+v_amount,updated_at=now()
        where driver_id=v_ride.driver_id;
      else
        update public.driver_wallets
        set balance=balance+v_amount,available_balance=available_balance+v_amount,updated_at=now()
        where driver_id=v_ride.driver_id;
      end if;
    end if;

    if v_provider='woovi' then
      select * into v_destination
      from public.driver_payout_destinations
      where driver_id=v_ride.driver_id
      limit 1;

      select * into v_payment_account
      from public.driver_payment_accounts
      where driver_id=v_ride.driver_id
        and provider='woovi'
        and status='active'
        and v_destination.driver_id is not null
        and pix_key=v_destination.pix_key
      limit 1;

      insert into public.driver_provider_credits(
        ride_id,driver_id,payment_account_id,provider,amount_cents,status,idempotency_key,created_at,updated_at
      ) values (
        v_ride.id,v_ride.driver_id,
        case when v_payment_account.id is null then null else v_payment_account.id end,
        'woovi',v_driver_earning_cents,'pending','woovi:ride-credit:'||v_ride.id::text,now(),now()
      )
      on conflict(ride_id,provider) do nothing;
    end if;
  else
    v_payment_status := case when v_payment_method in ('cash','dinheiro','money') then 'cash_pending' else 'pending' end;
    insert into public.ride_settlements(
      ride_id,passenger_id,driver_id,gross_amount,passenger_charge,payment_method,payment_status,status,created_at,updated_at
    ) values (
      v_ride.id,v_ride.passenger_id,v_ride.driver_id,v_amount,v_amount,v_payment_method,v_payment_status,'awaiting_payment',coalesce(v_ride.completed_at,now()),now()
    ) on conflict(ride_id) do nothing;
  end if;

  select * into v_settlement from public.ride_settlements where ride_id=v_ride.id;
  return v_settlement;
end;
$$;

revoke all on function public.ensure_ride_settlement(uuid) from public, anon, authenticated;
grant execute on function public.ensure_ride_settlement(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Woovi payout reservation reuses existing wallet, withdrawal table,
--    payout destination, audit log and public RPC wrapper.
-- ---------------------------------------------------------------------------

create unique index if not exists driver_withdrawals_driver_idempotency_uidx
  on public.driver_withdrawals(driver_id,idempotency_key)
  where idempotency_key is not null;
create unique index if not exists driver_withdrawals_woovi_transfer_uidx
  on public.driver_withdrawals(provider_transfer_id)
  where provider='woovi' and provider_transfer_id is not null;

create or replace function apois_rpc_private.driver_request_withdrawal(
  _amount_cents bigint,
  _idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_driver public.drivers%rowtype;
  v_wallet public.driver_wallets%rowtype;
  v_account public.driver_payment_accounts%rowtype;
  v_destination public.driver_payout_destinations%rowtype;
  v_withdrawal public.driver_withdrawals%rowtype;
  v_min_cents bigint := 2000;
  v_enabled boolean := false;
  v_target_provider text := 'disabled';
  v_amount numeric(14,2);
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if _amount_cents is null or _amount_cents <= 0 then raise exception 'invalid_withdrawal_amount' using errcode='22023'; end if;
  if _idempotency_key is null then raise exception 'idempotency_key_required' using errcode='22023'; end if;

  select coalesce((value #>> '{}')::boolean,false) into v_enabled
  from public.app_settings where key='finance.driver_payouts_enabled';
  if not coalesce(v_enabled,false) then raise exception 'driver_payouts_not_homologated' using errcode='55000'; end if;

  select coalesce(value #>> '{}','disabled') into v_target_provider
  from public.app_settings where key='finance.target_payout_provider';
  if coalesce(v_target_provider,'disabled') <> 'woovi' then raise exception 'payout_provider_not_woovi' using errcode='55000'; end if;

  select coalesce((value #>> '{}')::bigint,2000) into v_min_cents
  from public.app_settings where key='finance.driver_min_withdrawal_cents';
  if _amount_cents < coalesce(v_min_cents,2000) then raise exception 'min_withdrawal_amount' using errcode='22023'; end if;

  select d.* into v_driver
  from public.drivers d
  where d.user_id=public.mobility_user_id()
  limit 1;
  if v_driver.id is null then raise exception 'driver_not_found' using errcode='P0002'; end if;
  if v_driver.approval_status <> 'aprovado' or v_driver.blocked_at is not null or v_driver.suspended_at is not null then
    raise exception 'driver_not_eligible_for_payout' using errcode='42501';
  end if;

  select d.* into v_destination
  from public.driver_payout_destinations d
  where d.driver_id=v_driver.id;
  if v_destination.driver_id is null or v_destination.confirmed_at is null then
    raise exception 'pix_payout_destination_not_confirmed' using errcode='55000';
  end if;
  if v_destination.payout_available_at is not null and v_destination.payout_available_at > now() then
    raise exception 'pix_payout_destination_cooldown' using errcode='55000';
  end if;

  select a.* into v_account
  from public.driver_payment_accounts a
  where a.driver_id=v_driver.id
    and a.provider='woovi'
    and a.status='active'
    and a.pix_key=v_destination.pix_key
    and nullif(btrim(a.provider_subaccount_id),'') is not null
  limit 1;
  if v_account.id is null then raise exception 'woovi_subaccount_not_active' using errcode='55000'; end if;

  select w.* into v_wallet
  from public.driver_wallets w
  where w.driver_id=v_driver.id
  for update;
  if v_wallet.driver_id is null then raise exception 'driver_wallet_not_found' using errcode='P0002'; end if;

  select w.* into v_withdrawal
  from public.driver_withdrawals w
  where w.driver_id=v_driver.id and w.idempotency_key=_idempotency_key
  limit 1;
  if v_withdrawal.id is not null then
    return jsonb_build_object(
      'withdrawalId',v_withdrawal.id,'status',v_withdrawal.status,'provider',v_withdrawal.provider,
      'amountCents',round(v_withdrawal.amount*100)::bigint,'idempotent',true
    );
  end if;

  if exists(select 1 from public.driver_withdrawals w where w.driver_id=v_driver.id and w.status in ('pending','processing')) then
    raise exception 'withdrawal_already_in_progress' using errcode='55000';
  end if;

  v_amount := round(_amount_cents::numeric/100.0,2);
  if v_wallet.available_balance < v_amount or v_wallet.balance < v_amount then
    raise exception 'insufficient_available_balance' using errcode='22023';
  end if;

  insert into public.driver_withdrawals(
    driver_id,amount,status,provider,idempotency_key,pix_key,pix_key_type,pix_holder_name,requested_at,updated_at
  ) values (
    v_driver.id,v_amount,'pending','woovi',_idempotency_key,
    v_destination.pix_key,v_destination.pix_key_type,coalesce(v_destination.holder_name,v_driver.name),now(),now()
  ) returning * into v_withdrawal;

  update public.driver_wallets
  set balance=balance-v_amount,available_balance=available_balance-v_amount,updated_at=now()
  where driver_id=v_driver.id;

  insert into public.driver_wallet_transactions(driver_id,amount,direction,source,source_id,description)
  values(v_driver.id,v_amount,'debit','withdrawal',v_withdrawal.id,'Saque Pix Woovi solicitado');

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(
    auth.uid(),'driver_withdrawal_requested','driver_withdrawal',v_withdrawal.id::text,
    jsonb_build_object('provider','woovi','amount_cents',_amount_cents,'idempotency_key',_idempotency_key,'payment_account_id',v_account.id)
  );

  return jsonb_build_object(
    'withdrawalId',v_withdrawal.id,'status','pending','provider','woovi',
    'amountCents',_amount_cents,'idempotent',false
  );
end;
$$;

revoke all on function apois_rpc_private.driver_request_withdrawal(bigint,uuid) from public, anon, authenticated;
grant execute on function apois_rpc_private.driver_request_withdrawal(bigint,uuid) to authenticated, service_role;

create or replace function public.mark_driver_withdrawal_processing(_withdrawal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  update public.driver_withdrawals
  set status='processing',processed_at=coalesce(processed_at,now()),updated_at=now()
  where id=_withdrawal_id and status='pending';
end;
$$;
revoke all on function public.mark_driver_withdrawal_processing(uuid) from public,anon,authenticated;
grant execute on function public.mark_driver_withdrawal_processing(uuid) to service_role;

create or replace function public.mark_driver_withdrawal_paid(
  _withdrawal_id uuid,_transfer_id text,_end_to_end_id text,_response jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if exists(select 1 from public.driver_withdrawals where id=_withdrawal_id and status='paid') then return; end if;

  update public.driver_withdrawals
  set status='paid',provider='woovi',provider_transfer_id=coalesce(_transfer_id,provider_transfer_id),
      provider_end_to_end_id=coalesce(_end_to_end_id,provider_end_to_end_id),provider_response=_response,
      failure_reason=null,processed_at=coalesce(processed_at,now()),updated_at=now()
  where id=_withdrawal_id and status in ('pending','processing');
  if not found then raise exception 'withdrawal_not_payable' using errcode='55000'; end if;
end;
$$;
revoke all on function public.mark_driver_withdrawal_paid(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.mark_driver_withdrawal_paid(uuid,text,text,jsonb) to service_role;

create or replace function public.mark_driver_withdrawal_failed(
  _withdrawal_id uuid,_reason text,_response jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_w public.driver_withdrawals%rowtype;
  v_refund_inserted uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;

  select * into v_w from public.driver_withdrawals where id=_withdrawal_id for update;
  if v_w.id is null then raise exception 'withdrawal_not_found' using errcode='P0002'; end if;
  if v_w.status='failed' then return; end if;
  if v_w.status='paid' then raise exception 'paid_withdrawal_cannot_fail' using errcode='55000'; end if;
  if v_w.status not in ('pending','processing') then raise exception 'withdrawal_not_refundable' using errcode='55000'; end if;

  update public.driver_withdrawals
  set status='failed',provider='woovi',failure_reason=left(coalesce(_reason,'payout_failed'),1000),
      provider_response=_response,refunded_at=now(),processed_at=coalesce(processed_at,now()),updated_at=now()
  where id=_withdrawal_id;

  insert into public.driver_wallet_transactions(driver_id,amount,direction,source,source_id,description)
  values(v_w.driver_id,v_w.amount,'credit','withdrawal_refund',v_w.id,'Estorno automático de saque Pix Woovi')
  on conflict(driver_id,source,source_id) do nothing
  returning id into v_refund_inserted;

  if v_refund_inserted is not null then
    update public.driver_wallets
    set balance=balance+v_w.amount,available_balance=available_balance+v_w.amount,updated_at=now()
    where driver_id=v_w.driver_id;
  end if;
end;
$$;
revoke all on function public.mark_driver_withdrawal_failed(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mark_driver_withdrawal_failed(uuid,text,jsonb) to service_role;

-- Operational switches deliberately remain unchanged here:
--   finance.target_electronic_payment_provider remains its pre-cutover value until activation.
--   finance.driver_payouts_enabled remains false until E2E homologation.
--   finance.target_payout_provider remains its pre-cutover value until activation.

comment on function public.ensure_ride_settlement(uuid) is
  'Dual-provider settlement: preserves paid Asaas rides and uses pending provider-backed availability for Woovi.';
comment on function apois_rpc_private.driver_request_withdrawal(bigint,uuid) is
  'Provider-gated Woovi withdrawal reservation reusing the existing destination, wallet, ledger and withdrawal tables.';
