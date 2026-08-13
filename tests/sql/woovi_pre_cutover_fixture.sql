\set ON_ERROR_STOP on

create schema if not exists auth;
create schema if not exists private;
create schema if not exists apois_rpc_private;

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;

create or replace function auth.uid()
returns uuid language sql stable set search_path='' as $$
  select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid;
$$;

create or replace function auth.role()
returns text language sql stable set search_path='' as $$
  select 'service_role'::text;
$$;

create or replace function private.has_permission(_permission text)
returns boolean language sql stable set search_path='' as $$
  select true;
$$;

create table public.app_settings (
  key text primary key,
  value jsonb not null
);

insert into public.app_settings(key,value) values
  ('finance.driver_payouts_enabled','false'::jsonb),
  ('finance.target_electronic_payment_provider','"asaas"'::jsonb),
  ('finance.target_payout_provider','"asaas"'::jsonb),
  ('finance.driver_min_withdrawal_cents','2000'::jsonb);

create table public.drivers (
  id uuid primary key,
  user_id uuid not null unique,
  name text not null,
  approval_status text not null default 'pendente',
  blocked_at timestamptz,
  suspended_at timestamptz
);

insert into public.drivers(id,user_id,name,approval_status) values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'Motorista Teste APOIS',
  'aprovado'
);

create or replace function public.mobility_user_id()
returns uuid language sql stable set search_path='' as $$
  select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid;
$$;

create table public.rides (
  id uuid primary key,
  passenger_id uuid,
  driver_id uuid references public.drivers(id),
  estimated_price numeric(12,2),
  final_price numeric(12,2),
  payment_method text,
  payment_status text default 'pending',
  payment_provider text,
  provider_payment_id text,
  payment_confirmed_at timestamptz,
  status text not null,
  search_expires_at timestamptz,
  dispatch_attempts integer not null default 0,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  origin_name text not null default 'Origem',
  destination_name text not null default 'Destino',
  category text not null default 'carro',
  distance_km numeric,
  duration_min numeric
);

-- Existing row at cutover: this is intentionally provider-bound to Asaas.
insert into public.rides(
  id,passenger_id,driver_id,estimated_price,final_price,payment_method,
  payment_status,payment_provider,provider_payment_id,status,completed_at
) values (
  '11111111-1111-4111-8111-111111111111',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  20.00,20.00,'pix','paid','asaas','pay_legacy_1','finalizada',now()
);

create table public.ride_pix_payments (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides(id),
  provider text not null default 'asaas',
  provider_payment_id text,
  amount_cents bigint not null,
  provider_fee_cents bigint not null default 0,
  status text not null,
  attempt_number integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ride_pix_payments_provider_check check(provider in ('asaas','woovi'))
);

insert into public.ride_pix_payments(
  ride_id,provider,provider_payment_id,amount_cents,status,attempt_number
) values (
  '11111111-1111-4111-8111-111111111111','asaas','pay_legacy_1',2000,'received',1
);

create table public.ride_settlements (
  ride_id uuid primary key references public.rides(id),
  passenger_id uuid,
  driver_id uuid references public.drivers(id),
  gross_amount numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  passenger_charge numeric(12,2) not null default 0,
  platform_fee numeric(12,2) not null default 0,
  driver_earning numeric(12,2) not null default 0,
  payment_provider_fee numeric(12,2) not null default 0,
  cash_amount numeric(12,2) not null default 0,
  wallet_amount numeric(12,2) not null default 0,
  refunded_amount numeric(12,2) not null default 0,
  payment_method text,
  payment_provider text,
  provider_payment_id text,
  payment_status text,
  status text,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.driver_wallets (
  driver_id uuid primary key references public.drivers(id),
  balance numeric(12,2) not null default 0,
  available_balance numeric(12,2) not null default 0,
  pending_balance numeric(12,2) not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

insert into public.driver_wallets(driver_id,balance,available_balance,pending_balance)
values('dddddddd-dddd-4ddd-8ddd-dddddddddddd',10.00,7.00,3.00);

create table public.driver_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id),
  amount numeric(12,2) not null,
  direction text not null,
  source text not null,
  source_id uuid not null,
  description text,
  created_at timestamptz not null default now(),
  unique(driver_id,source,source_id)
);

create table public.driver_payout_destinations (
  driver_id uuid primary key references public.drivers(id),
  pix_key text not null,
  pix_key_type text not null,
  holder_name text,
  confirmed_at timestamptz,
  payout_available_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.driver_withdrawals (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id),
  amount numeric(14,2) not null,
  status text not null,
  provider text,
  idempotency_key uuid,
  pix_key text,
  pix_key_type text,
  pix_holder_name text,
  provider_transfer_id text,
  provider_end_to_end_id text,
  provider_response jsonb,
  failure_reason text,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  refunded_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table public.driver_asaas_accounts (
  driver_id uuid primary key references public.drivers(id),
  status text,
  subaccount_id text,
  wallet_id text
);

create table public.asaas_subaccount_credentials (
  driver_id uuid primary key references public.drivers(id)
);
