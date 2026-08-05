-- Carteira do motorista e crédito idempotente de corridas finalizadas.

create table if not exists public.driver_wallets (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null unique,
  balance numeric(12,2) not null default 0 check (balance >= 0),
  pending_balance numeric(12,2) not null default 0 check (pending_balance >= 0),
  currency text not null default 'BRL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.driver_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null,
  ride_id uuid,
  type text not null check (type in ('ride_credit','adjustment_credit','adjustment_debit','withdrawal')),
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'available' check (status in ('pending','available','reversed')),
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  available_at timestamptz,
  reversed_at timestamptz
);

create unique index if not exists driver_wallet_transactions_ride_credit_uidx
  on public.driver_wallet_transactions (ride_id, type)
  where ride_id is not null and type = 'ride_credit';

create index if not exists driver_wallet_transactions_driver_created_idx
  on public.driver_wallet_transactions (driver_id, created_at desc);

alter table public.driver_wallets enable row level security;
alter table public.driver_wallet_transactions enable row level security;

drop policy if exists "driver_reads_own_wallet" on public.driver_wallets;
create policy "driver_reads_own_wallet"
  on public.driver_wallets for select
  to authenticated
  using (driver_id = auth.uid());

drop policy if exists "driver_reads_own_wallet_transactions" on public.driver_wallet_transactions;
create policy "driver_reads_own_wallet_transactions"
  on public.driver_wallet_transactions for select
  to authenticated
  using (driver_id = auth.uid());

revoke insert, update, delete on public.driver_wallets from anon, authenticated;
revoke insert, update, delete on public.driver_wallet_transactions from anon, authenticated;

grant select on public.driver_wallets to authenticated;
grant select on public.driver_wallet_transactions to authenticated;

create or replace function public.credit_driver_completed_ride(
  p_ride_id uuid,
  p_driver_id uuid,
  p_amount numeric
)
returns table (
  credited boolean,
  balance numeric,
  transaction_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides%rowtype;
  v_transaction_id uuid;
  v_balance numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_credit_amount';
  end if;

  select * into v_ride
  from public.rides
  where id = p_ride_id
  for update;

  if not found then
    raise exception 'ride_not_found';
  end if;

  if v_ride.status::text <> 'finalizada' then
    raise exception 'ride_not_completed';
  end if;

  if v_ride.driver_id is null or v_ride.driver_id <> p_driver_id then
    raise exception 'driver_not_assigned';
  end if;

  select id into v_transaction_id
  from public.driver_wallet_transactions
  where ride_id = p_ride_id and type = 'ride_credit'
  limit 1;

  if v_transaction_id is not null then
    select dw.balance into v_balance
    from public.driver_wallets dw
    where dw.driver_id = p_driver_id;

    return query select false, coalesce(v_balance, 0), v_transaction_id;
    return;
  end if;

  insert into public.driver_wallets (driver_id, balance, pending_balance, updated_at)
  values (p_driver_id, p_amount, 0, now())
  on conflict (driver_id) do update
    set balance = public.driver_wallets.balance + excluded.balance,
        updated_at = now()
  returning public.driver_wallets.balance into v_balance;

  insert into public.driver_wallet_transactions (
    driver_id,
    ride_id,
    type,
    amount,
    status,
    description,
    available_at,
    metadata
  ) values (
    p_driver_id,
    p_ride_id,
    'ride_credit',
    p_amount,
    'available',
    'Crédito de corrida finalizada',
    now(),
    jsonb_build_object('source', 'driver-ride-action')
  )
  returning id into v_transaction_id;

  return query select true, v_balance, v_transaction_id;
end;
$$;

revoke all on function public.credit_driver_completed_ride(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.credit_driver_completed_ride(uuid, uuid, numeric) to service_role;
