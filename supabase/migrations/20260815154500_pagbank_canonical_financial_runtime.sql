-- APOIS Corridas — close the PagBank prepaid Pix runtime without changing the
-- active production provider. This migration is safe to install while another
-- provider remains selected in app_settings.

alter table public.rides
  add column if not exists fare_amount_cents bigint;

update public.rides
set fare_amount_cents = round(estimated_price * 100)::bigint
where fare_amount_cents is null
  and estimated_price is not null
  and estimated_price >= 0;

alter table public.ride_pix_payments
  add column if not exists refunded_amount_cents bigint not null default 0;

alter table public.ride_pix_payments
  drop constraint if exists ride_pix_payments_refunded_amount_cents_check;
alter table public.ride_pix_payments
  add constraint ride_pix_payments_refunded_amount_cents_check
  check (refunded_amount_cents >= 0 and refunded_amount_cents <= amount_cents);

alter table public.ride_pix_payments
  drop constraint if exists ride_pix_payments_provider_check;
alter table public.ride_pix_payments
  add constraint ride_pix_payments_provider_check
  check (provider in ('asaas','woovi','pagbank'));

create or replace function private.enforce_ride_payment_breakdown()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fare_cents bigint;
  v_target_provider text;
  v_provider text;
  v_processing_fee bigint;
begin
  if new.estimated_price is null or new.estimated_price < 0 then return new; end if;
  v_fare_cents := round(new.estimated_price * 100)::bigint;
  new.fare_amount_cents := v_fare_cents;

  if lower(coalesce(new.payment_method,'')) <> 'pix' then
    new.processing_fee_cents := 0;
    new.passenger_charge_cents := v_fare_cents;
    if tg_op='INSERT' then new.payment_provider := null; end if;
    return new;
  end if;

  if tg_op='UPDATE'
     and lower(coalesce(old.payment_provider,'')) in ('asaas','woovi','pagbank')
     and (old.provider_payment_id is not null or old.payment_status='paid') then
    v_provider := lower(old.payment_provider);
    new.payment_provider := v_provider;
    new.fare_amount_cents := coalesce(old.fare_amount_cents,v_fare_cents);
    if old.processing_fee_cents is not null and old.passenger_charge_cents is not null then
      new.processing_fee_cents := old.processing_fee_cents;
      new.passenger_charge_cents := old.passenger_charge_cents;
    elsif v_provider='asaas' then
      new.processing_fee_cents := 0;
      new.passenger_charge_cents := v_fare_cents;
    else
      v_processing_fee := private.calculate_pix_processing_fee_cents(v_fare_cents);
      new.processing_fee_cents := v_processing_fee;
      new.passenger_charge_cents := v_fare_cents + v_processing_fee;
    end if;
    return new;
  end if;

  select nullif(lower(btrim(coalesce(value #>> '{}',''))),'')
    into v_target_provider
  from public.app_settings
  where key='finance.target_electronic_payment_provider'
  limit 1;

  if v_target_provider not in ('asaas','woovi','pagbank') then
    raise exception 'electronic_payment_provider_not_supported' using errcode='55000';
  end if;

  new.payment_provider := v_target_provider;
  if v_target_provider='asaas' then
    new.processing_fee_cents := 0;
    new.passenger_charge_cents := v_fare_cents;
  else
    v_processing_fee := private.calculate_pix_processing_fee_cents(v_fare_cents);
    new.processing_fee_cents := v_processing_fee;
    new.passenger_charge_cents := v_fare_cents + v_processing_fee;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_ride_payment_breakdown() from public, anon, authenticated;

drop trigger if exists trg_enforce_prepaid_pix_provider_target on public.rides;
drop trigger if exists trg_enforce_ride_payment_breakdown on public.rides;
create trigger trg_enforce_ride_payment_breakdown
before insert or update of estimated_price, payment_method on public.rides
for each row execute function private.enforce_ride_payment_breakdown();

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
  v_fare_cents bigint;
  v_processing_fee_cents bigint;
  v_passenger_charge_cents bigint;
  v_fare_amount numeric(12,2);
  v_processing_fee numeric(12,2);
  v_passenger_charge numeric(12,2);
begin
  select * into v_ride from public.rides where id=_ride_id for share;
  if not found then raise exception 'ride_not_found'; end if;
  if v_ride.status::text <> 'finalizada' then raise exception 'ride_not_completed'; end if;
  if v_ride.driver_id is null then raise exception 'ride_driver_missing'; end if;

  v_amount := coalesce(v_ride.final_price,v_ride.estimated_price);
  if v_amount is null or v_amount <= 0 then raise exception 'invalid_completed_ride_amount'; end if;
  v_payment_method := lower(trim(coalesce(v_ride.payment_method,'')));
  if v_payment_method='' then raise exception 'ride_payment_method_missing'; end if;

  if v_payment_method='pix' then
    v_provider := lower(trim(coalesce(v_ride.payment_provider,'')));
    if v_ride.payment_status <> 'paid'
       or v_provider not in ('asaas','woovi','pagbank')
       or v_ride.provider_payment_id is null then
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
    if coalesce(v_payment.refunded_amount_cents,0) > 0 then
      raise exception 'prepaid_pix_refunded_before_settlement';
    end if;

    v_fare_cents := coalesce(v_ride.fare_amount_cents,round(v_amount*100)::bigint);
    v_processing_fee_cents := coalesce(v_ride.processing_fee_cents,0);
    v_passenger_charge_cents := coalesce(v_ride.passenger_charge_cents,v_fare_cents+v_processing_fee_cents);
    if v_fare_cents <= 0 or v_processing_fee_cents < 0
       or v_passenger_charge_cents <> v_fare_cents + v_processing_fee_cents
       or round(v_amount*100)::bigint <> v_fare_cents then
      raise exception 'invalid_ride_financial_snapshot';
    end if;
    if v_payment.amount_cents <> v_passenger_charge_cents then
      raise exception 'prepaid_pix_amount_mismatch';
    end if;

    v_fare_amount := round(v_fare_cents::numeric/100,2);
    v_processing_fee := round(v_processing_fee_cents::numeric/100,2);
    v_passenger_charge := round(v_passenger_charge_cents::numeric/100,2);
    v_provider_fee := round(coalesce(v_payment.provider_fee_cents,0)::numeric/100,2);

    insert into public.ride_settlements(
      ride_id,passenger_id,driver_id,gross_amount,discount_amount,passenger_charge,
      platform_fee,driver_earning,payment_provider_fee,cash_amount,wallet_amount,
      refunded_amount,payment_method,payment_provider,provider_payment_id,
      payment_status,status,settled_at,created_at,updated_at,processing_fee
    ) values (
      v_ride.id,v_ride.passenger_id,v_ride.driver_id,v_fare_amount,0,v_passenger_charge,
      0,v_fare_amount,v_provider_fee,0,0,0,'pix',v_provider,v_ride.provider_payment_id,
      'confirmed','settled',now(),coalesce(v_ride.completed_at,now()),now(),v_processing_fee
    )
    on conflict(ride_id) do update set
      driver_id=excluded.driver_id,
      gross_amount=excluded.gross_amount,
      passenger_charge=excluded.passenger_charge,
      processing_fee=excluded.processing_fee,
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
      v_ride.driver_id,v_fare_amount,'credit','ride',v_ride.id,
      case when v_provider='woovi'
        then 'Corrida Pix pré-paga concluída — aguardando crédito Woovi'
        else 'Corrida Pix pré-paga concluída'
      end
    )
    on conflict(driver_id,source,source_id) do nothing
    returning id into v_inserted_tx;

    if v_inserted_tx is not null then
      if v_provider='woovi' then
        update public.driver_wallets
        set balance=balance+v_fare_amount,
            pending_balance=pending_balance+v_fare_amount,
            updated_at=now()
        where driver_id=v_ride.driver_id;
      else
        update public.driver_wallets
        set balance=balance+v_fare_amount,
            available_balance=available_balance+v_fare_amount,
            updated_at=now()
        where driver_id=v_ride.driver_id;
      end if;
    end if;

    if v_provider='woovi' then
      select * into v_destination from public.driver_payout_destinations where driver_id=v_ride.driver_id limit 1;
      select * into v_payment_account
      from public.driver_payment_accounts
      where driver_id=v_ride.driver_id and provider='woovi' and status='active'
        and v_destination.driver_id is not null and pix_key=v_destination.pix_key
      limit 1;
      insert into public.driver_provider_credits(
        ride_id,driver_id,payment_account_id,provider,amount_cents,status,idempotency_key,created_at,updated_at
      ) values (
        v_ride.id,v_ride.driver_id,
        case when v_payment_account.id is null then null else v_payment_account.id end,
        'woovi',v_fare_cents,'pending','woovi:ride-credit:'||v_ride.id::text,now(),now()
      ) on conflict(ride_id,provider) do nothing;
    end if;
  else
    v_payment_status := case when v_payment_method in ('cash','dinheiro','money') then 'cash_pending' else 'pending' end;
    insert into public.ride_settlements(
      ride_id,passenger_id,driver_id,gross_amount,passenger_charge,payment_method,payment_status,status,created_at,updated_at
    ) values (
      v_ride.id,v_ride.passenger_id,v_ride.driver_id,v_amount,v_amount,v_payment_method,v_payment_status,
      'awaiting_payment',coalesce(v_ride.completed_at,now()),now()
    ) on conflict(ride_id) do nothing;
  end if;

  select * into v_settlement from public.ride_settlements where ride_id=v_ride.id;
  return v_settlement;
end;
$$;

create or replace function public.reconcile_pagbank_ride_refund(
  _ride_id uuid,
  _provider_payment_id text,
  _refunded_amount_cents bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.ride_pix_payments%rowtype;
  v_settlement public.ride_settlements%rowtype;
  v_wallet public.driver_wallets%rowtype;
  v_credit public.driver_wallet_transactions%rowtype;
  v_debit public.driver_wallet_transactions%rowtype;
  v_previous_refund_cents bigint;
  v_processing_fee_cents bigint;
  v_target_driver_debit numeric(14,2);
  v_existing_driver_debit numeric(14,2) := 0;
  v_delta numeric(14,2);
  v_full_refund boolean;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if _ride_id is null or nullif(btrim(coalesce(_provider_payment_id,'')),'') is null
     or _refunded_amount_cents <= 0 then
    raise exception 'invalid_refund_identity' using errcode='22023';
  end if;

  select * into v_payment
  from public.ride_pix_payments
  where ride_id=_ride_id and provider='pagbank' and provider_payment_id=_provider_payment_id
  for update;
  if not found then raise exception 'pagbank_ride_payment_not_found' using errcode='P0002'; end if;
  if _refunded_amount_cents > v_payment.amount_cents then raise exception 'refund_exceeds_payment' using errcode='22023'; end if;

  v_previous_refund_cents := coalesce(v_payment.refunded_amount_cents,0);
  if _refunded_amount_cents < v_previous_refund_cents then
    raise exception 'refund_amount_regressed' using errcode='22023';
  end if;
  if _refunded_amount_cents = v_previous_refund_cents then
    return jsonb_build_object('ok',true,'duplicate',true,'refundedAmountCents',v_previous_refund_cents);
  end if;

  v_full_refund := _refunded_amount_cents = v_payment.amount_cents;
  update public.ride_pix_payments
  set refunded_amount_cents=_refunded_amount_cents,
      status=case when v_full_refund then 'refunded' else status end,
      updated_at=now()
  where id=v_payment.id;

  select * into v_settlement from public.ride_settlements where ride_id=_ride_id for update;
  if not found then
    update public.rides
    set payment_status='refunded', updated_at=now()
    where id=_ride_id and payment_provider='pagbank' and provider_payment_id=_provider_payment_id;
    return jsonb_build_object(
      'ok',true,'duplicate',false,'settlementExists',false,
      'fullRefund',v_full_refund,'refundedAmountCents',_refunded_amount_cents
    );
  end if;

  if lower(coalesce(v_settlement.payment_provider,'')) <> 'pagbank'
     or coalesce(v_settlement.provider_payment_id,'') <> _provider_payment_id then
    raise exception 'ride_refund_provider_mismatch' using errcode='22023';
  end if;

  select * into v_credit
  from public.driver_wallet_transactions
  where driver_id=v_settlement.driver_id and source='ride' and source_id=_ride_id and direction='credit'
  limit 1;
  if not found then raise exception 'ride_wallet_credit_missing' using errcode='55000'; end if;

  v_processing_fee_cents := greatest(0,round(coalesce(v_settlement.processing_fee,0)*100)::bigint);
  v_target_driver_debit := round(
    greatest(0::numeric,
      least(round(v_credit.amount::numeric,2),
        greatest(0,(_refunded_amount_cents-v_processing_fee_cents))::numeric/100
      )
    ),2
  );

  select * into v_debit
  from public.driver_wallet_transactions
  where driver_id=v_settlement.driver_id and source='ride_refund' and source_id=_ride_id
  limit 1;
  if found then v_existing_driver_debit := round(v_debit.amount::numeric,2); end if;
  if v_target_driver_debit < v_existing_driver_debit then raise exception 'refund_driver_debit_regressed' using errcode='55000'; end if;
  v_delta := v_target_driver_debit - v_existing_driver_debit;

  if v_delta > 0 then
    select * into v_wallet from public.driver_wallets where driver_id=v_settlement.driver_id for update;
    if not found then raise exception 'driver_wallet_not_found' using errcode='P0002'; end if;
    if v_wallet.balance < v_delta or v_wallet.available_balance < v_delta then
      raise exception 'insufficient_wallet_balance_for_refund_reversal' using errcode='55000';
    end if;

    if v_debit.id is null then
      insert into public.driver_wallet_transactions(driver_id,amount,direction,source,source_id,description)
      values(v_settlement.driver_id,v_target_driver_debit,'debit','ride_refund',_ride_id,'Estorno acumulado de corrida Pix PagBank')
      returning * into v_debit;
    else
      update public.driver_wallet_transactions
      set amount=v_target_driver_debit,
          description='Estorno acumulado de corrida Pix PagBank'
      where id=v_debit.id;
    end if;

    update public.driver_wallets
    set balance=balance-v_delta,
        available_balance=available_balance-v_delta,
        updated_at=now()
    where driver_id=v_settlement.driver_id;
  end if;

  update public.ride_settlements
  set refunded_amount=round(_refunded_amount_cents::numeric/100,2),
      payment_status=case when v_full_refund then 'refunded' else payment_status end,
      status=case when v_full_refund then 'refunded' else status end,
      updated_at=now()
  where ride_id=_ride_id;

  if v_full_refund then
    update public.rides set payment_status='refunded',updated_at=now()
    where id=_ride_id and payment_provider='pagbank' and provider_payment_id=_provider_payment_id;
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(null,'pagbank_ride_refund_reconciled','ride',_ride_id::text,
    jsonb_build_object(
      'provider_payment_id',_provider_payment_id,
      'previous_refund_cents',v_previous_refund_cents,
      'refunded_amount_cents',_refunded_amount_cents,
      'driver_wallet_debit_delta',v_delta,
      'driver_wallet_debit_total',v_target_driver_debit,
      'full_refund',v_full_refund
    ));

  return jsonb_build_object(
    'ok',true,'duplicate',false,'settlementExists',true,'fullRefund',v_full_refund,
    'refundedAmountCents',_refunded_amount_cents,'driverWalletDebitDelta',v_delta,
    'driverWalletDebitTotal',v_target_driver_debit
  );
end;
$$;

revoke all on function public.reconcile_pagbank_ride_refund(uuid,text,bigint) from public, anon, authenticated;
grant execute on function public.reconcile_pagbank_ride_refund(uuid,text,bigint) to service_role;
