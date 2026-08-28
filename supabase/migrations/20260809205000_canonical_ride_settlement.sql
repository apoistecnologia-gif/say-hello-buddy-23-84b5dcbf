-- APOIS Corridas — settlement canônico compatível com o schema vivo.
--
-- Esta migration NÃO reaproveita as migrations legadas de 2026-08-05 que
-- redefiniam driver_wallets/driver_wallet_transactions com outro contrato.
-- O ledger vivo (apois_driver_wallet_core) permanece a fonte canônica.
--
-- Nesta etapa, concluir uma corrida cria o registro financeiro server-side,
-- mas NÃO credita pagamentos eletrônicos na carteira do motorista antes da
-- confirmação do gateway. Campos cuja regra comercial/provedor ainda não foi
-- confirmada permanecem NULL em vez de inventarmos taxa, comissão ou repasse.

begin;

create table if not exists public.ride_settlements (
  ride_id uuid primary key references public.rides(id) on delete cascade,
  passenger_id uuid not null,
  driver_id uuid references public.drivers(id) on delete set null,
  currency text not null default 'BRL',
  gross_amount numeric(12,2) not null check (gross_amount > 0),
  discount_amount numeric(12,2) check (discount_amount is null or discount_amount >= 0),
  passenger_charge numeric(12,2) not null check (passenger_charge > 0),
  platform_fee numeric(12,2) check (platform_fee is null or platform_fee >= 0),
  driver_earning numeric(12,2) check (driver_earning is null or driver_earning >= 0),
  payment_provider_fee numeric(12,2) check (payment_provider_fee is null or payment_provider_fee >= 0),
  cash_amount numeric(12,2) check (cash_amount is null or cash_amount >= 0),
  wallet_amount numeric(12,2) check (wallet_amount is null or wallet_amount >= 0),
  refunded_amount numeric(12,2) check (refunded_amount is null or refunded_amount >= 0),
  payment_method text not null,
  payment_provider text,
  provider_payment_id text,
  payment_status text not null default 'pending'
    check (payment_status in ('pending','confirmed','failed','refunded','cash_pending','cash_confirmed')),
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment','ready_to_settle','settled','refunded','failed')),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ride_settlements_passenger_created_idx
  on public.ride_settlements(passenger_id, created_at desc);

create index if not exists ride_settlements_driver_created_idx
  on public.ride_settlements(driver_id, created_at desc)
  where driver_id is not null;

create index if not exists ride_settlements_status_created_idx
  on public.ride_settlements(status, created_at desc);

alter table public.ride_settlements enable row level security;

revoke all on public.ride_settlements from anon, authenticated;
grant select on public.ride_settlements to authenticated;

drop policy if exists ride_settlements_passenger_read_own on public.ride_settlements;
create policy ride_settlements_passenger_read_own
on public.ride_settlements
for select
to authenticated
using (passenger_id = public.mobility_user_id());

drop policy if exists ride_settlements_driver_read_own on public.ride_settlements;
create policy ride_settlements_driver_read_own
on public.ride_settlements
for select
to authenticated
using (
  exists (
    select 1
    from public.drivers d
    where d.id = ride_settlements.driver_id
      and d.user_id = public.mobility_user_id()
  )
);

drop policy if exists ride_settlements_admin_read on public.ride_settlements;
create policy ride_settlements_admin_read
on public.ride_settlements
for select
to authenticated
using (private.has_permission('users.manage'));

create or replace function public.ensure_ride_settlement(_ride_id uuid)
returns public.ride_settlements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides%rowtype;
  v_settlement public.ride_settlements%rowtype;
  v_amount numeric(12,2);
  v_payment_method text;
  v_payment_status text;
begin
  select * into v_ride
  from public.rides
  where id = _ride_id
  for share;

  if not found then
    raise exception 'ride_not_found';
  end if;

  if v_ride.status::text <> 'finalizada' then
    raise exception 'ride_not_completed';
  end if;

  if v_ride.driver_id is null then
    raise exception 'ride_driver_missing';
  end if;

  v_amount := coalesce(v_ride.final_price, v_ride.estimated_price);
  if v_amount is null or v_amount <= 0 then
    raise exception 'invalid_completed_ride_amount';
  end if;

  v_payment_method := lower(trim(coalesce(v_ride.payment_method, '')));
  if v_payment_method = '' then
    raise exception 'ride_payment_method_missing';
  end if;

  v_payment_status := case
    when v_payment_method in ('cash','dinheiro','money') then 'cash_pending'
    else 'pending'
  end;

  insert into public.ride_settlements (
    ride_id,
    passenger_id,
    driver_id,
    gross_amount,
    passenger_charge,
    payment_method,
    payment_status,
    status,
    created_at,
    updated_at
  ) values (
    v_ride.id,
    v_ride.passenger_id,
    v_ride.driver_id,
    v_amount,
    v_amount,
    v_payment_method,
    v_payment_status,
    'awaiting_payment',
    coalesce(v_ride.completed_at, now()),
    now()
  )
  on conflict (ride_id) do nothing;

  select * into v_settlement
  from public.ride_settlements
  where ride_id = v_ride.id;

  return v_settlement;
end;
$$;

revoke all on function public.ensure_ride_settlement(uuid) from public, anon, authenticated;

create or replace function public.handle_completed_ride_settlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status::text = 'finalizada'
     and old.status::text is distinct from 'finalizada' then
    perform public.ensure_ride_settlement(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.handle_completed_ride_settlement() from public, anon, authenticated;

drop trigger if exists trg_create_ride_settlement_on_finish on public.rides;
create trigger trg_create_ride_settlement_on_finish
after update of status on public.rides
for each row
when (new.status::text = 'finalizada' and old.status::text is distinct from 'finalizada')
execute function public.handle_completed_ride_settlement();

-- Backfill idempotente das corridas já concluídas. Isto NÃO marca pagamento
-- eletrônico como confirmado e NÃO cria crédito na carteira.
insert into public.ride_settlements (
  ride_id,
  passenger_id,
  driver_id,
  gross_amount,
  passenger_charge,
  payment_method,
  payment_status,
  status,
  created_at,
  updated_at
)
select
  r.id,
  r.passenger_id,
  r.driver_id,
  coalesce(r.final_price, r.estimated_price),
  coalesce(r.final_price, r.estimated_price),
  lower(trim(r.payment_method)),
  case
    when lower(trim(r.payment_method)) in ('cash','dinheiro','money') then 'cash_pending'
    else 'pending'
  end,
  'awaiting_payment',
  coalesce(r.completed_at, r.updated_at, now()),
  now()
from public.rides r
where r.status::text = 'finalizada'
  and r.driver_id is not null
  and coalesce(r.final_price, r.estimated_price, 0) > 0
  and nullif(trim(coalesce(r.payment_method, '')), '') is not null
on conflict (ride_id) do nothing;

create or replace function public.get_passenger_ride_receipt(_ride_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_passenger_id uuid;
  v_ride public.rides%rowtype;
  v_settlement public.ride_settlements%rowtype;
begin
  v_passenger_id := public.mobility_user_id();
  if v_passenger_id is null then
    raise exception 'unauthorized';
  end if;

  select * into v_ride
  from public.rides
  where id = _ride_id
    and passenger_id = v_passenger_id
  limit 1;

  if not found then
    raise exception 'ride_not_found';
  end if;

  if v_ride.status::text = 'finalizada' then
    select * into v_settlement
    from public.ride_settlements
    where ride_id = v_ride.id;

    if not found then
      v_settlement := public.ensure_ride_settlement(v_ride.id);
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'source', 'server',
    'ride', to_jsonb(v_ride),
    'settlement', case
      when v_settlement.ride_id is null then null
      else jsonb_build_object(
        'ride_id', v_settlement.ride_id,
        'currency', v_settlement.currency,
        'gross_amount', v_settlement.gross_amount,
        'discount_amount', v_settlement.discount_amount,
        'passenger_charge', v_settlement.passenger_charge,
        'platform_fee', v_settlement.platform_fee,
        'driver_earning', v_settlement.driver_earning,
        'payment_provider_fee', v_settlement.payment_provider_fee,
        'cash_amount', v_settlement.cash_amount,
        'wallet_amount', v_settlement.wallet_amount,
        'refunded_amount', v_settlement.refunded_amount,
        'payment_method', v_settlement.payment_method,
        'payment_provider', v_settlement.payment_provider,
        'provider_payment_id', v_settlement.provider_payment_id,
        'payment_status', v_settlement.payment_status,
        'status', v_settlement.status,
        'settled_at', v_settlement.settled_at,
        'created_at', v_settlement.created_at,
        'updated_at', v_settlement.updated_at
      )
    end
  );
end;
$$;

revoke all on function public.get_passenger_ride_receipt(uuid) from public, anon;
grant execute on function public.get_passenger_ride_receipt(uuid) to authenticated;

commit;
