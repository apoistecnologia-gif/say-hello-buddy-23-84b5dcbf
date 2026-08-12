alter table public.ride_pix_payments
  add column if not exists provider_net_amount_cents bigint,
  add column if not exists provider_fee_cents bigint;

alter table public.ride_pix_payments drop constraint if exists ride_pix_payments_provider_net_amount_cents_check;
alter table public.ride_pix_payments
  add constraint ride_pix_payments_provider_net_amount_cents_check
  check (provider_net_amount_cents is null or provider_net_amount_cents >= 0);
alter table public.ride_pix_payments drop constraint if exists ride_pix_payments_provider_fee_cents_check;
alter table public.ride_pix_payments
  add constraint ride_pix_payments_provider_fee_cents_check
  check (provider_fee_cents is null or provider_fee_cents >= 0);

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
  v_amount numeric(12,2);
  v_payment_method text;
  v_payment_status text;
  v_inserted_tx uuid;
  v_provider_fee numeric(12,2) := 0;
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

  v_payment_method := lower(trim(coalesce(v_ride.payment_method, '')));
  if v_payment_method = '' then raise exception 'ride_payment_method_missing'; end if;

  if v_payment_method = 'pix' then
    if v_ride.payment_status <> 'paid' or v_ride.payment_provider <> 'asaas' or v_ride.provider_payment_id is null then
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
    if v_payment.amount_cents <> round(v_amount * 100)::bigint then
      raise exception 'prepaid_pix_amount_mismatch';
    end if;

    v_provider_fee := round(coalesce(v_payment.provider_fee_cents,0)::numeric / 100, 2);

    insert into public.ride_settlements (
      ride_id, passenger_id, driver_id, gross_amount, discount_amount,
      passenger_charge, platform_fee, driver_earning, payment_provider_fee,
      cash_amount, wallet_amount, refunded_amount,
      payment_method, payment_provider, provider_payment_id,
      payment_status, status, settled_at, created_at, updated_at
    ) values (
      v_ride.id, v_ride.passenger_id, v_ride.driver_id, v_amount, 0,
      v_amount, 0, v_amount, v_provider_fee,
      0, 0, 0,
      'pix', 'asaas', v_ride.provider_payment_id,
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
      payment_provider = 'asaas',
      provider_payment_id = excluded.provider_payment_id,
      payment_status = 'confirmed',
      status = 'settled',
      settled_at = coalesce(public.ride_settlements.settled_at,now()),
      updated_at = now();

    insert into public.driver_wallets(driver_id,balance,available_balance,created_at,updated_at)
    values(v_ride.driver_id,0,0,now(),now())
    on conflict(driver_id) do nothing;

    insert into public.driver_wallet_transactions(driver_id,amount,direction,source,source_id,description)
    values(v_ride.driver_id,v_amount,'credit','ride',v_ride.id,'Corrida Pix pré-paga concluída')
    on conflict(driver_id,source,source_id) do nothing
    returning id into v_inserted_tx;

    if v_inserted_tx is not null then
      update public.driver_wallets
      set balance=balance+v_amount,
          available_balance=available_balance+v_amount,
          updated_at=now()
      where driver_id=v_ride.driver_id;
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

comment on function public.ensure_ride_settlement(uuid) is 'Creates canonical completion settlement. Pix is already paid before dispatch and credits the driver ledger once, only when the ride completes.';
