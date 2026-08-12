-- APOIS Corridas: provider-neutral prepaid Pix settlement + external driver-credit outbox.
-- Driver earning remains the full ride fare. Passenger processing fee is separate.

alter table public.ride_settlements
  add column if not exists processing_fee numeric(12,2) not null default 0;

create table if not exists public.driver_provider_credits (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides(id) on delete restrict,
  driver_id uuid not null references public.drivers(id) on delete restrict,
  provider text not null,
  amount_cents bigint not null,
  status text not null default 'pending',
  provider_reference text,
  attempts integer not null default 0,
  last_error text,
  next_attempt_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_provider_credits_ride_unique unique (ride_id),
  constraint driver_provider_credits_amount_positive check (amount_cents > 0),
  constraint driver_provider_credits_status_check check (status in ('pending','processing','completed','failed'))
);

alter table public.driver_provider_credits enable row level security;
revoke all on public.driver_provider_credits from anon, authenticated;

create index if not exists idx_driver_provider_credits_pending
  on public.driver_provider_credits (status, next_attempt_at, created_at)
  where status in ('pending','failed');

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
  v_fare numeric(12,2);
  v_passenger_charge numeric(12,2);
  v_processing_fee numeric(12,2);
  v_payment_method text;
  v_payment_status text;
  v_inserted_tx uuid;
  v_provider_fee numeric(12,2) := 0;
  v_expected_payment_cents bigint;
begin
  select * into v_ride
  from public.rides
  where id = _ride_id
  for share;

  if not found then raise exception 'ride_not_found'; end if;
  if v_ride.status::text <> 'finalizada' then raise exception 'ride_not_completed'; end if;
  if v_ride.driver_id is null then raise exception 'ride_driver_missing'; end if;

  v_fare := round(coalesce(v_ride.final_price, v_ride.estimated_price)::numeric, 2);
  if v_fare is null or v_fare <= 0 then raise exception 'invalid_completed_ride_amount'; end if;

  v_processing_fee := round(coalesce(v_ride.processing_fee, 0)::numeric, 2);
  v_passenger_charge := round(coalesce(v_ride.passenger_total, v_fare + v_processing_fee)::numeric, 2);
  if v_processing_fee < 0 or v_passenger_charge < v_fare then
    raise exception 'invalid_passenger_charge_breakdown';
  end if;

  v_payment_method := lower(trim(coalesce(v_ride.payment_method, '')));
  if v_payment_method = '' then raise exception 'ride_payment_method_missing'; end if;

  if v_payment_method = 'pix' then
    if v_ride.payment_status <> 'paid'
       or v_ride.payment_provider not in ('asaas','openpix')
       or v_ride.provider_payment_id is null then
      raise exception 'prepaid_pix_not_confirmed';
    end if;

    select * into v_payment
    from public.ride_pix_payments
    where ride_id = v_ride.id
      and provider = v_ride.payment_provider
      and provider_payment_id = v_ride.provider_payment_id
      and status = 'received'
    order by attempt_number desc
    limit 1;
    if not found then raise exception 'prepaid_pix_receipt_missing'; end if;

    v_expected_payment_cents := round(v_passenger_charge * 100)::bigint;
    if v_payment.amount_cents <> v_expected_payment_cents then
      raise exception 'prepaid_pix_amount_mismatch';
    end if;

    if coalesce(v_payment.fare_amount_cents, round(v_fare * 100)::bigint) <> round(v_fare * 100)::bigint then
      raise exception 'prepaid_pix_fare_amount_mismatch';
    end if;
    if coalesce(v_payment.processing_fee_cents, round(v_processing_fee * 100)::bigint) <> round(v_processing_fee * 100)::bigint then
      raise exception 'prepaid_pix_processing_fee_mismatch';
    end if;

    v_provider_fee := round(coalesce(v_payment.provider_fee_cents,0)::numeric / 100, 2);

    insert into public.ride_settlements (
      ride_id, passenger_id, driver_id, gross_amount, discount_amount,
      passenger_charge, platform_fee, driver_earning, payment_provider_fee, processing_fee,
      cash_amount, wallet_amount, refunded_amount,
      payment_method, payment_provider, provider_payment_id,
      payment_status, status, settled_at, created_at, updated_at
    ) values (
      v_ride.id, v_ride.passenger_id, v_ride.driver_id, v_fare, 0,
      v_passenger_charge, 0, v_fare, v_provider_fee, v_processing_fee,
      0, 0, 0,
      'pix', v_ride.payment_provider, v_ride.provider_payment_id,
      'confirmed', 'settled', now(), coalesce(v_ride.completed_at,now()), now()
    )
    on conflict (ride_id) do update set
      driver_id = excluded.driver_id,
      gross_amount = excluded.gross_amount,
      passenger_charge = excluded.passenger_charge,
      platform_fee = 0,
      driver_earning = excluded.driver_earning,
      payment_provider_fee = excluded.payment_provider_fee,
      processing_fee = excluded.processing_fee,
      payment_method = 'pix',
      payment_provider = excluded.payment_provider,
      provider_payment_id = excluded.provider_payment_id,
      payment_status = 'confirmed',
      status = 'settled',
      settled_at = coalesce(public.ride_settlements.settled_at,now()),
      updated_at = now();

    insert into public.driver_wallets(driver_id,balance,available_balance,created_at,updated_at)
    values(v_ride.driver_id,0,0,now(),now())
    on conflict(driver_id) do nothing;

    insert into public.driver_wallet_transactions(driver_id,amount,direction,source,source_id,description)
    values(v_ride.driver_id,v_fare,'credit','ride',v_ride.id,'Corrida Pix pré-paga concluída')
    on conflict(driver_id,source,source_id) do nothing
    returning id into v_inserted_tx;

    if v_inserted_tx is not null then
      update public.driver_wallets
      set balance=balance+v_fare,
          available_balance=available_balance+v_fare,
          updated_at=now()
      where driver_id=v_ride.driver_id;
    end if;

    -- OpenPix receives the passenger payment before dispatch. The driver is only
    -- known later, so the provider subaccount credit is queued after completion.
    if v_ride.payment_provider = 'openpix' then
      insert into public.driver_provider_credits(
        ride_id, driver_id, provider, amount_cents, status, created_at, updated_at
      ) values (
        v_ride.id, v_ride.driver_id, 'openpix', round(v_fare * 100)::bigint, 'pending', now(), now()
      )
      on conflict (ride_id) do nothing;
    end if;
  else
    v_payment_status := case
      when v_payment_method in ('cash','dinheiro','money') then 'cash_pending'
      else 'pending'
    end;

    insert into public.ride_settlements (
      ride_id, passenger_id, driver_id, gross_amount, passenger_charge,
      processing_fee, payment_method, payment_status, status, created_at, updated_at
    ) values (
      v_ride.id, v_ride.passenger_id, v_ride.driver_id, v_fare, v_fare,
      0, v_payment_method, v_payment_status, 'awaiting_payment',
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

comment on column public.ride_settlements.processing_fee is
  'Passenger-paid processing cost recovery. Not platform commission and not driver earning.';
comment on table public.driver_provider_credits is
  'Service-role outbox for idempotent external credits to driver payment-provider subaccounts after completed rides.';
