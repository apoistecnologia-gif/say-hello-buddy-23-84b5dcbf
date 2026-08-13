-- APOIS Corridas — safe Woovi schema foundation stage.
--
-- This migration is intentionally sequenced immediately after the already
-- staged provider constraint/pending-balance migrations. It may be installed
-- while production still targets Asaas. It completes only the schema/provider
-- gates needed by later Woovi hardening migrations and does NOT replace the
-- currently active Asaas payment activation, settlement or payout RPCs and
-- does NOT change any finance.* provider switch.

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

-- Existing rows are historical at install time. Never retroactively charge a
-- processing fee; preserve their current fare as the passenger charge.
update public.rides
set processing_fee_cents=0,
    passenger_charge_cents=round(estimated_price*100)::bigint
where passenger_charge_cents is null
  and estimated_price is not null
  and estimated_price >= 0;

comment on column public.rides.processing_fee_cents is
  'Passenger-facing Taxa de processamento in integer cents. Zero until Woovi is the active electronic provider.';
comment on column public.rides.passenger_charge_cents is
  'Server-authoritative passenger charge in cents.';

alter table public.ride_pix_payments drop constraint if exists ride_pix_payments_provider_check;
alter table public.ride_pix_payments
  add constraint ride_pix_payments_provider_check check (provider in ('asaas','woovi'));

alter table public.driver_wallets
  add column if not exists pending_balance numeric(12,2) not null default 0;
alter table public.driver_wallets drop constraint if exists driver_wallets_pending_balance_nonnegative;
alter table public.driver_wallets
  add constraint driver_wallets_pending_balance_nonnegative check (pending_balance >= 0);

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
  on public.driver_payment_accounts(driver_id,provider);
create unique index if not exists driver_payment_accounts_provider_pix_uidx
  on public.driver_payment_accounts(provider,pix_key);

alter table public.driver_payment_accounts enable row level security;
revoke all on table public.driver_payment_accounts from anon,authenticated;
grant all on table public.driver_payment_accounts to service_role;

comment on table public.driver_payment_accounts is
  'Private provider binding. driver_payout_destinations remains authoritative for the Pix destination.';

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
  unique(ride_id,provider),
  unique(idempotency_key)
);

create index if not exists driver_provider_credits_pending_idx
  on public.driver_provider_credits(status,created_at)
  where status in ('pending','failed');

alter table public.driver_provider_credits enable row level security;
revoke all on table public.driver_provider_credits from anon,authenticated;
grant all on table public.driver_provider_credits to service_role;

create or replace function private.calculate_pix_processing_fee_cents(_fare_cents bigint)
returns bigint
language plpgsql
immutable
strict
set search_path=''
as $$
declare
  v_fare bigint := greatest(_fare_cents,0);
  v_fee bigint := 50;
  v_next bigint;
  i integer;
begin
  for i in 1..16 loop
    v_next := least(500::bigint,greatest(50::bigint,ceil(((v_fare+v_fee)::numeric*80)/10000)::bigint));
    if v_next=v_fee then return v_fee; end if;
    v_fee := v_next;
  end loop;
  return v_fee;
end;
$$;

revoke all on function private.calculate_pix_processing_fee_cents(bigint) from public,anon,authenticated;
grant execute on function private.calculate_pix_processing_fee_cents(bigint) to service_role;

create or replace function private.enforce_ride_payment_breakdown()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_fare_cents bigint;
  v_preserve_existing_provider boolean := false;
  v_target_provider text := 'asaas';
begin
  if new.estimated_price is null or new.estimated_price<0 then return new; end if;
  v_fare_cents := round(new.estimated_price*100)::bigint;

  if lower(coalesce(new.payment_method,''))='pix' then
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
      new.passenger_charge_cents := v_fare_cents+new.processing_fee_cents;
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

revoke all on function private.enforce_ride_payment_breakdown() from public,anon,authenticated;

drop trigger if exists trg_enforce_ride_payment_breakdown on public.rides;
create trigger trg_enforce_ride_payment_breakdown
before insert or update of estimated_price,payment_method on public.rides
for each row execute function private.enforce_ride_payment_breakdown();

create or replace function private.enforce_new_ride_pix_provider()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_target_provider text := 'asaas';
  v_ride_provider text;
begin
  select lower(coalesce(value #>> '{}','asaas')) into v_target_provider
  from public.app_settings
  where key='finance.target_electronic_payment_provider';
  v_target_provider := coalesce(v_target_provider,'asaas');

  if v_target_provider not in ('asaas','woovi') then
    raise exception 'electronic_payment_provider_not_supported' using errcode='55000';
  end if;
  if lower(coalesce(new.provider,''))<>v_target_provider then
    raise exception 'electronic_payment_provider_not_active' using errcode='55000';
  end if;

  select lower(coalesce(r.payment_provider,'')) into v_ride_provider
  from public.rides r where r.id=new.ride_id;
  if coalesce(v_ride_provider,'')='' then raise exception 'ride_payment_provider_missing' using errcode='55000'; end if;
  if v_ride_provider<>lower(new.provider) then raise exception 'ride_payment_provider_mismatch' using errcode='55000'; end if;
  return new;
end;
$$;

revoke all on function private.enforce_new_ride_pix_provider() from public,anon,authenticated;

drop trigger if exists trg_enforce_new_ride_pix_provider on public.ride_pix_payments;
create trigger trg_enforce_new_ride_pix_provider
before insert on public.ride_pix_payments
for each row execute function private.enforce_new_ride_pix_provider();

comment on function private.enforce_ride_payment_breakdown() is
  'Server-authoritative payment breakdown gated by finance.target_electronic_payment_provider.';
comment on function private.enforce_new_ride_pix_provider() is
  'Rejects fresh ride Pix attempts from any provider other than the configured active electronic provider.';