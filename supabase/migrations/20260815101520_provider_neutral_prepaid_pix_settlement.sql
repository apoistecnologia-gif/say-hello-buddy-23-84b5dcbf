create or replace function public.activate_prepaid_pix_ride(_ride_id uuid, _provider_payment_id text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ride public.rides%rowtype;
  v_payment public.ride_pix_payments%rowtype;
  v_expected_cents bigint;
  v_transitioned boolean := false;
  v_provider text;
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

  v_provider := nullif(lower(btrim(coalesce(v_payment.provider,''))), '');
  if v_provider is null then
    raise exception 'ride_pix_provider_missing' using errcode='22023';
  end if;

  v_expected_cents := round(v_ride.estimated_price * 100)::bigint;
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
      'payment_provider', v_ride.payment_provider,
      'should_dispatch', (v_ride.status='procurar_motorista' and coalesce(v_ride.dispatch_attempts,0)=0)
    );
  end if;

  if v_ride.status <> 'aguardando_pagamento' then
    raise exception 'ride_not_awaiting_payment' using errcode='55000';
  end if;

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
  v_transitioned := true;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'transitioned', v_transitioned,
    'ride_id', v_ride.id,
    'status', v_ride.status,
    'payment_status', v_ride.payment_status,
    'payment_provider', v_ride.payment_provider,
    'should_dispatch', true
  );
end;
$function$;

create or replace function public.ensure_ride_settlement(_ride_id uuid)
returns public.ride_settlements
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ride public.rides%rowtype;
  v_settlement public.ride_settlements%rowtype;
  v_payment public.ride_pix_payments%rowtype;
  v_amount numeric(12,2);
  v_payment_method text;
  v_payment_status text;
  v_inserted_tx uuid;
  v_provider_fee numeric(12,2) := 0;
  v_provider text;
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
    if v_ride.payment_status <> 'paid' or v_ride.provider_payment_id is null then
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

    v_provider := nullif(lower(btrim(coalesce(v_payment.provider,''))), '');
    if v_provider is null then raise exception 'prepaid_pix_provider_missing'; end if;
    if nullif(lower(btrim(coalesce(v_ride.payment_provider,''))), '') is distinct from v_provider then
      raise exception 'prepaid_pix_provider_mismatch';
    end if;
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
      'pix', v_provider, v_ride.provider_payment_id,
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
$function$;