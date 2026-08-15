create or replace function public.reverse_refunded_ride_payment(
  _ride_id uuid,
  _provider text,
  _provider_payment_id text,
  _refunded_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_settlement public.ride_settlements%rowtype;
  v_wallet public.driver_wallets%rowtype;
  v_credit public.driver_wallet_transactions%rowtype;
  v_existing_debit public.driver_wallet_transactions%rowtype;
  v_provider text := nullif(lower(btrim(coalesce(_provider,''))), '');
  v_payment_id text := nullif(btrim(coalesce(_provider_payment_id,'')), '');
  v_refund numeric(14,2) := round(coalesce(_refunded_amount,0)::numeric,2);
  v_debit numeric(14,2);
  v_inserted uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  if _ride_id is null or v_provider is null or v_payment_id is null or v_refund <= 0 then
    raise exception 'invalid_refund_identity' using errcode='22023';
  end if;

  select * into v_settlement
  from public.ride_settlements
  where ride_id=_ride_id
  for update;
  if not found then raise exception 'ride_settlement_not_found' using errcode='P0002'; end if;
  if v_settlement.driver_id is null then raise exception 'ride_driver_missing' using errcode='55000'; end if;
  if lower(coalesce(v_settlement.payment_method,'')) <> 'pix' then
    raise exception 'ride_payment_method_not_pix' using errcode='22023';
  end if;
  if lower(coalesce(v_settlement.payment_provider,'')) <> v_provider
     or coalesce(v_settlement.provider_payment_id,'') <> v_payment_id then
    raise exception 'ride_refund_provider_mismatch' using errcode='22023';
  end if;

  if v_settlement.status='refunded' and v_settlement.payment_status='refunded' then
    select * into v_existing_debit
    from public.driver_wallet_transactions
    where driver_id=v_settlement.driver_id
      and source='ride_refund'
      and source_id=_ride_id
    limit 1;
    return jsonb_build_object(
      'ok',true,
      'duplicate',true,
      'ride_id',_ride_id,
      'wallet_reversed',v_existing_debit.id is not null
    );
  end if;

  if v_settlement.status <> 'settled' or v_settlement.payment_status not in ('confirmed','paid') then
    raise exception 'ride_settlement_not_refundable' using errcode='55000';
  end if;

  select * into v_credit
  from public.driver_wallet_transactions
  where driver_id=v_settlement.driver_id
    and source='ride'
    and source_id=_ride_id
    and direction='credit'
  limit 1;
  if not found then raise exception 'ride_wallet_credit_missing' using errcode='55000'; end if;

  v_debit := least(v_refund, round(v_credit.amount::numeric,2));
  if v_debit <= 0 then raise exception 'invalid_refund_debit' using errcode='22023'; end if;

  select * into v_wallet
  from public.driver_wallets
  where driver_id=v_settlement.driver_id
  for update;
  if not found then raise exception 'driver_wallet_not_found' using errcode='P0002'; end if;

  select * into v_existing_debit
  from public.driver_wallet_transactions
  where driver_id=v_settlement.driver_id
    and source='ride_refund'
    and source_id=_ride_id
  limit 1;

  if v_existing_debit.id is null then
    if v_wallet.balance < v_debit or v_wallet.available_balance < v_debit then
      insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
      values(null,'ride_refund_wallet_reversal_blocked','ride',_ride_id::text,
        jsonb_build_object(
          'provider',v_provider,
          'provider_payment_id',v_payment_id,
          'refund_amount',v_refund,
          'required_wallet_debit',v_debit,
          'wallet_balance',v_wallet.balance,
          'wallet_available_balance',v_wallet.available_balance
        ));
      raise exception 'insufficient_wallet_balance_for_refund_reversal' using errcode='55000';
    end if;

    insert into public.driver_wallet_transactions(
      driver_id,amount,direction,source,source_id,description
    ) values (
      v_settlement.driver_id,v_debit,'debit','ride_refund',_ride_id,
      'Estorno de corrida Pix reembolsada pelo provedor'
    )
    on conflict(driver_id,source,source_id) do nothing
    returning id into v_inserted;

    if v_inserted is not null then
      update public.driver_wallets
      set balance=balance-v_debit,
          available_balance=available_balance-v_debit,
          updated_at=now()
      where driver_id=v_settlement.driver_id;
    end if;
  end if;

  update public.ride_settlements
  set payment_status='refunded',
      status='refunded',
      refunded_amount=v_refund,
      updated_at=now()
  where ride_id=_ride_id;

  update public.rides
  set payment_status='refunded',
      updated_at=now()
  where id=_ride_id
    and provider_payment_id=v_payment_id;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(null,'ride_refund_wallet_reversed','ride',_ride_id::text,
    jsonb_build_object(
      'provider',v_provider,
      'provider_payment_id',v_payment_id,
      'refund_amount',v_refund,
      'wallet_debit',v_debit,
      'driver_id',v_settlement.driver_id
    ));

  return jsonb_build_object(
    'ok',true,
    'duplicate',v_inserted is null,
    'ride_id',_ride_id,
    'driver_id',v_settlement.driver_id,
    'wallet_debit',v_debit,
    'refunded_amount',v_refund
  );
end;
$function$;

revoke all on function public.reverse_refunded_ride_payment(uuid,text,text,numeric) from public, anon, authenticated;
grant execute on function public.reverse_refunded_ride_payment(uuid,text,text,numeric) to service_role;
