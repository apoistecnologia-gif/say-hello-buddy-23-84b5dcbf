create or replace function public.driver_confirm_cash_payment(_ride_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_profile_id uuid;
  v_driver_id uuid;
  v_ride public.rides%rowtype;
  v_settlement public.ride_settlements%rowtype;
  v_amount numeric(12,2);
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode='42501';
  end if;

  v_profile_id := public.mobility_user_id();
  if v_profile_id is null then
    raise exception 'profile_missing' using errcode='42501';
  end if;

  select d.id into v_driver_id
  from public.drivers d
  where d.user_id = v_profile_id;

  if v_driver_id is null then
    raise exception 'driver_profile_missing' using errcode='42501';
  end if;

  select * into v_ride
  from public.rides r
  where r.id = _ride_id
  for update;

  if not found then
    raise exception 'ride_not_found' using errcode='P0002';
  end if;
  if v_ride.driver_id is distinct from v_driver_id then
    raise exception 'driver_not_assigned' using errcode='42501';
  end if;
  if v_ride.status <> 'finalizada' then
    raise exception 'ride_not_completed' using errcode='23514';
  end if;
  if lower(trim(coalesce(v_ride.payment_method,''))) not in ('cash','dinheiro','money') then
    raise exception 'cash_payment_only' using errcode='23514';
  end if;

  v_amount := round(coalesce(v_ride.final_price, v_ride.estimated_price), 2);
  if v_amount is null or v_amount <= 0 then
    raise exception 'invalid_completed_ride_amount' using errcode='23514';
  end if;

  perform public.ensure_ride_settlement(v_ride.id);

  select * into v_settlement
  from public.ride_settlements s
  where s.ride_id = v_ride.id
  for update;

  if v_settlement.status = 'settled' and v_settlement.payment_status = 'confirmed' then
    if lower(trim(v_settlement.payment_method)) not in ('cash','dinheiro','money') then
      raise exception 'settlement_already_confirmed_by_other_method' using errcode='23514';
    end if;
    return jsonb_build_object(
      'ride_id', v_ride.id,
      'payment_status', 'paid',
      'settlement_status', v_settlement.status,
      'cash_amount', v_settlement.cash_amount,
      'reused', true
    );
  end if;

  update public.rides
  set payment_status = 'paid',
      payment_confirmed_at = coalesce(payment_confirmed_at, now()),
      updated_at = now()
  where id = v_ride.id;

  update public.ride_settlements
  set driver_id = v_driver_id,
      gross_amount = v_amount,
      passenger_charge = v_amount,
      platform_fee = 0,
      driver_earning = v_amount,
      payment_provider_fee = 0,
      cash_amount = v_amount,
      wallet_amount = 0,
      refunded_amount = coalesce(refunded_amount,0),
      payment_method = 'cash',
      payment_provider = null,
      provider_payment_id = null,
      payment_status = 'confirmed',
      status = 'settled',
      settled_at = coalesce(settled_at, now()),
      updated_at = now()
  where ride_id = v_ride.id
  returning * into v_settlement;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values(
    auth.uid(),
    'driver_confirm_cash_payment',
    'ride',
    v_ride.id::text,
    jsonb_build_object('amount', v_amount, 'payment_method', 'cash')
  );

  return jsonb_build_object(
    'ride_id', v_ride.id,
    'payment_status', 'paid',
    'settlement_status', v_settlement.status,
    'cash_amount', v_settlement.cash_amount,
    'reused', false
  );
end;
$function$;

revoke all on function public.driver_confirm_cash_payment(uuid) from public, anon;
grant execute on function public.driver_confirm_cash_payment(uuid) to authenticated;
