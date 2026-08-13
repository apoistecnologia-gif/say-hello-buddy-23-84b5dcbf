insert into public.app_settings(key,value,description)
values
  ('finance.driver_withdrawal_fee_payer','"driver"'::jsonb,'Who pays the Woovi withdrawal fee. Commercial decision: driver.'),
  ('finance.driver_withdrawal_fee_cents','100'::jsonb,'Configured Woovi withdrawal fee in cents when the free-withdrawal threshold does not apply.'),
  ('finance.driver_withdrawal_fee_free_threshold_cents','50000'::jsonb,'Configured gross withdrawal threshold in cents at or above which the Woovi withdrawal fee is zero. Keep configurable because provider terms may change.')
on conflict (key) do update
set value=excluded.value,
    description=excluded.description,
    updated_at=now();

alter table public.driver_withdrawals
  add column if not exists provider_fee_amount numeric(14,2) not null default 0,
  add column if not exists net_amount numeric(14,2);

update public.driver_withdrawals
set net_amount=amount-provider_fee_amount
where net_amount is null;

alter table public.driver_withdrawals
  alter column net_amount set not null;

alter table public.driver_withdrawals
  drop constraint if exists driver_withdrawals_provider_fee_amount_check,
  add constraint driver_withdrawals_provider_fee_amount_check check (provider_fee_amount >= 0),
  drop constraint if exists driver_withdrawals_net_amount_check,
  add constraint driver_withdrawals_net_amount_check check (net_amount > 0),
  drop constraint if exists driver_withdrawals_amount_breakdown_check,
  add constraint driver_withdrawals_amount_breakdown_check check (round(amount,2)=round(net_amount+provider_fee_amount,2));

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

  select coalesce(value #>> '{}','driver') into v_fee_payer from public.app_settings where key='finance.driver_withdrawal_fee_payer';
  select coalesce((value #>> '{}')::bigint,100) into v_fee_cents from public.app_settings where key='finance.driver_withdrawal_fee_cents';
  select coalesce((value #>> '{}')::bigint,50000) into v_fee_free_threshold_cents from public.app_settings where key='finance.driver_withdrawal_fee_free_threshold_cents';

  if v_fee_payer='driver' and _amount_cents < v_fee_free_threshold_cents then
    v_applied_fee_cents:=greatest(v_fee_cents,0);
  else
    v_applied_fee_cents:=0;
  end if;

  v_net_cents:=_amount_cents-v_applied_fee_cents;
  if v_net_cents<=0 then raise exception 'withdrawal_amount_not_above_fee' using errcode='22023'; end if;

  select d.* into v_driver from public.drivers d where d.user_id=public.mobility_user_id() limit 1;
  if v_driver.id is null then raise exception 'driver_not_found' using errcode='P0002'; end if;
  if v_driver.approval_status<>'aprovado' or v_driver.blocked_at is not null or v_driver.suspended_at is not null then raise exception 'driver_not_eligible_for_payout' using errcode='42501'; end if;

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
  values(
    v_driver.id,v_amount,'debit','withdrawal',v_withdrawal.id,
    case when v_applied_fee_cents>0
      then format('Saque Pix Woovi solicitado — líquido R$ %s, taxa R$ %s',to_char(v_net_amount,'FM999999990.00'),to_char(v_fee_amount,'FM999999990.00'))
      else 'Saque Pix Woovi solicitado — sem taxa'
    end
  );

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
