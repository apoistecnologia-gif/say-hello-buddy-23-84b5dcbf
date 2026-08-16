-- Finalize the driver-paid Woovi withdrawal-fee model.
-- Gross amount leaves the wallet, the provider receives the net amount, and
-- the fee is represented as its own wallet-ledger debit.

alter table public.driver_withdrawals
  drop constraint if exists driver_withdrawals_provider_fee_amount_nonnegative,
  add constraint driver_withdrawals_provider_fee_amount_nonnegative
    check (provider_fee_amount >= 0),
  drop constraint if exists driver_withdrawals_net_amount_positive,
  add constraint driver_withdrawals_net_amount_positive
    check (net_amount > 0),
  drop constraint if exists driver_withdrawals_amount_breakdown_valid,
  add constraint driver_withdrawals_amount_breakdown_valid
    check (round(amount,2)=round(net_amount+provider_fee_amount,2));

create or replace function public.calculate_driver_withdrawal_breakdown(_amount_cents bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_fee_payer text:='driver';
  v_fee_cents bigint:=100;
  v_threshold bigint:=50000;
  v_applied bigint:=0;
  v_net bigint;
begin
  if _amount_cents is null or _amount_cents<=0 then
    raise exception 'invalid_withdrawal_amount' using errcode='22023';
  end if;

  select coalesce((select value #>> '{}' from public.app_settings where key='finance.driver_withdrawal_fee_payer'),'driver') into v_fee_payer;
  select coalesce((select (value #>> '{}')::bigint from public.app_settings where key='finance.driver_withdrawal_fee_cents'),100) into v_fee_cents;
  select coalesce((select (value #>> '{}')::bigint from public.app_settings where key='finance.driver_withdrawal_fee_free_threshold_cents'),50000) into v_threshold;

  if v_fee_payer='driver' and _amount_cents<v_threshold then
    v_applied:=greatest(v_fee_cents,0);
  end if;

  v_net:=_amount_cents-v_applied;
  return jsonb_build_object(
    'amountCents',_amount_cents,
    'feePayer',v_fee_payer,
    'feeCents',v_applied,
    'netAmountCents',v_net,
    'feeFreeThresholdCents',v_threshold
  );
end;
$function$;

revoke all on function public.calculate_driver_withdrawal_breakdown(bigint) from public,anon,authenticated;
grant execute on function public.calculate_driver_withdrawal_breakdown(bigint) to service_role;

create or replace function apois_rpc_private.driver_request_withdrawal(_amount_cents bigint, _idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_driver public.drivers%rowtype;
  v_wallet public.driver_wallets%rowtype;
  v_account public.driver_payment_accounts%rowtype;
  v_destination public.driver_payout_destinations%rowtype;
  v_withdrawal public.driver_withdrawals%rowtype;
  v_min_cents bigint:=2000;
  v_enabled boolean:=false;
  v_target_provider text:='disabled';
  v_fee_payer text:='driver';
  v_fee_cents bigint:=100;
  v_fee_free_threshold_cents bigint:=50000;
  v_applied_fee_cents bigint:=0;
  v_net_cents bigint;
  v_amount numeric(14,2);
  v_fee_amount numeric(14,2);
  v_net_amount numeric(14,2);
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if _amount_cents is null or _amount_cents<=0 then raise exception 'invalid_withdrawal_amount' using errcode='22023'; end if;
  if _idempotency_key is null then raise exception 'idempotency_key_required' using errcode='22023'; end if;

  select coalesce((value #>> '{}')::boolean,false) into v_enabled from public.app_settings where key='finance.driver_payouts_enabled';
  if not coalesce(v_enabled,false) then raise exception 'driver_payouts_not_homologated' using errcode='55000'; end if;

  select coalesce(value #>> '{}','disabled') into v_target_provider from public.app_settings where key='finance.target_payout_provider';
  if coalesce(v_target_provider,'disabled')<>'woovi' then raise exception 'payout_provider_not_woovi' using errcode='55000'; end if;

  select coalesce((value #>> '{}')::bigint,2000) into v_min_cents from public.app_settings where key='finance.driver_min_withdrawal_cents';
  if _amount_cents<coalesce(v_min_cents,2000) then raise exception 'min_withdrawal_amount' using errcode='22023'; end if;

  select coalesce((select value #>> '{}' from public.app_settings where key='finance.driver_withdrawal_fee_payer'),'driver') into v_fee_payer;
  select coalesce((select (value #>> '{}')::bigint from public.app_settings where key='finance.driver_withdrawal_fee_cents'),100) into v_fee_cents;
  select coalesce((select (value #>> '{}')::bigint from public.app_settings where key='finance.driver_withdrawal_fee_free_threshold_cents'),50000) into v_fee_free_threshold_cents;

  if v_fee_payer='driver' and _amount_cents < v_fee_free_threshold_cents then
    v_applied_fee_cents:=greatest(v_fee_cents,0);
  else
    v_applied_fee_cents:=0;
  end if;

  v_net_cents:=_amount_cents-v_applied_fee_cents;
  if v_net_cents<=0 then raise exception 'withdrawal_amount_not_above_fee' using errcode='22023'; end if;

  select d.* into v_driver from public.drivers d where d.user_id=public.mobility_user_id() limit 1;
  if v_driver.id is null then raise exception 'driver_not_found' using errcode='P0002'; end if;
  if v_driver.approval_status<>'aprovado' or v_driver.blocked_at is not null or v_driver.suspended_at is not null then
    raise exception 'driver_not_eligible_for_payout' using errcode='42501';
  end if;

  select d.* into v_destination from public.driver_payout_destinations d where d.driver_id=v_driver.id;
  if v_destination.driver_id is null or v_destination.confirmed_at is null then raise exception 'pix_payout_destination_not_confirmed' using errcode='55000'; end if;
  if v_destination.payout_available_at is not null and v_destination.payout_available_at>now() then raise exception 'pix_payout_destination_cooldown' using errcode='55000'; end if;

  select a.* into v_account
  from public.driver_payment_accounts a
  where a.driver_id=v_driver.id and a.provider='woovi' and a.status='active'
    and a.pix_key=v_destination.pix_key and nullif(btrim(a.provider_subaccount_id),'') is not null
  limit 1;
  if v_account.id is null then raise exception 'woovi_subaccount_not_active' using errcode='55000'; end if;

  select w.* into v_wallet from public.driver_wallets w where w.driver_id=v_driver.id for update;
  if v_wallet.driver_id is null then raise exception 'driver_wallet_not_found' using errcode='P0002'; end if;

  select w.* into v_withdrawal
  from public.driver_withdrawals w
  where w.driver_id=v_driver.id and w.idempotency_key=_idempotency_key
  limit 1;
  if v_withdrawal.id is not null then
    return jsonb_build_object(
      'withdrawalId',v_withdrawal.id,
      'status',v_withdrawal.status,
      'provider',v_withdrawal.provider,
      'amountCents',round(v_withdrawal.amount*100)::bigint,
      'feeCents',round(v_withdrawal.provider_fee_amount*100)::bigint,
      'netAmountCents',round(v_withdrawal.net_amount*100)::bigint,
      'idempotent',true
    );
  end if;

  if exists(select 1 from public.driver_withdrawals w where w.driver_id=v_driver.id and w.status in ('pending','processing')) then
    raise exception 'withdrawal_already_in_progress' using errcode='55000';
  end if;

  v_amount:=round(_amount_cents::numeric/100.0,2);
  v_fee_amount:=round(v_applied_fee_cents::numeric/100.0,2);
  v_net_amount:=round(v_net_cents::numeric/100.0,2);

  if v_wallet.available_balance<v_amount or v_wallet.balance<v_amount then
    raise exception 'insufficient_available_balance' using errcode='22023';
  end if;

  insert into public.driver_withdrawals(
    driver_id,amount,provider_fee_amount,net_amount,status,provider,idempotency_key,
    pix_key,pix_key_type,pix_holder_name,requested_at,updated_at
  ) values(
    v_driver.id,v_amount,v_fee_amount,v_net_amount,'pending','woovi',_idempotency_key,
    v_destination.pix_key,v_destination.pix_key_type,coalesce(v_destination.holder_name,v_driver.name),now(),now()
  ) returning * into v_withdrawal;

  update public.driver_wallets
  set balance=balance-v_amount,
      available_balance=available_balance-v_amount,
      updated_at=now()
  where driver_id=v_driver.id;

  insert into public.driver_wallet_transactions(driver_id,amount,direction,source,source_id,description)
  values(v_driver.id,v_net_amount,'debit','withdrawal',v_withdrawal.id,'Saque Pix Woovi solicitado');

  if v_fee_amount>0 then
    insert into public.driver_wallet_transactions(driver_id,amount,direction,source,source_id,description)
    values(v_driver.id,v_fee_amount,'debit','withdrawal_fee',v_withdrawal.id,'Taxa de saque Pix Woovi');
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(
    auth.uid(),'driver_withdrawal_requested','driver_withdrawal',v_withdrawal.id::text,
    jsonb_build_object(
      'provider','woovi',
      'amount_cents',_amount_cents,
      'fee_payer',v_fee_payer,
      'fee_cents',v_applied_fee_cents,
      'net_amount_cents',v_net_cents,
      'idempotency_key',_idempotency_key,
      'payment_account_id',v_account.id
    )
  );

  return jsonb_build_object(
    'withdrawalId',v_withdrawal.id,
    'status','pending',
    'provider','woovi',
    'amountCents',_amount_cents,
    'feeCents',v_applied_fee_cents,
    'netAmountCents',v_net_cents,
    'idempotent',false
  );
end;
$function$;

create or replace function public.mark_driver_withdrawal_failed(_withdrawal_id uuid, _reason text, _response jsonb)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_w public.driver_withdrawals%rowtype;
  v_refund_inserted uuid;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;

  select * into v_w from public.driver_withdrawals where id=_withdrawal_id for update;
  if v_w.id is null then raise exception 'withdrawal_not_found' using errcode='P0002'; end if;
  if v_w.status='failed' then return; end if;
  if v_w.status='paid' then raise exception 'paid_withdrawal_cannot_fail' using errcode='55000'; end if;
  if v_w.status not in ('pending','processing') then raise exception 'withdrawal_not_refundable' using errcode='55000'; end if;

  update public.driver_withdrawals
  set status='failed',provider='woovi',failure_reason=left(coalesce(_reason,'payout_failed'),1000),
      provider_response=_response,refunded_at=now(),processed_at=coalesce(processed_at,now()),updated_at=now()
  where id=_withdrawal_id;

  insert into public.driver_wallet_transactions(driver_id,amount,direction,source,source_id,description)
  values(v_w.driver_id,v_w.amount,'credit','withdrawal_refund',v_w.id,'Estorno automático de saque Pix Woovi, incluindo taxa não cobrada')
  on conflict(driver_id,source,source_id) do nothing
  returning id into v_refund_inserted;

  if v_refund_inserted is not null then
    update public.driver_wallets
    set balance=balance+v_w.amount,
        available_balance=available_balance+v_w.amount,
        updated_at=now()
    where driver_id=v_w.driver_id;
  end if;
end;
$function$;
