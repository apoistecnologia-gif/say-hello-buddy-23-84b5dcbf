-- APOIS Corridas — migrate driver withdrawals from legacy Asaas contracts to Woovi.
-- Payouts remain disabled by the operational switch until homologation explicitly enables them.

update public.app_settings
set value = to_jsonb('woovi'::text)
where key = 'finance.target_payout_provider';

create or replace function apois_rpc_private.driver_request_withdrawal(
  _amount_cents bigint,
  _idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_driver public.drivers%rowtype;
  v_wallet public.driver_wallets%rowtype;
  v_account public.driver_payment_accounts%rowtype;
  v_withdrawal public.driver_withdrawals%rowtype;
  v_min_cents bigint := 2000;
  v_enabled boolean := false;
  v_target_provider text := 'disabled';
  v_amount numeric(14,2);
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode='42501';
  end if;
  if _amount_cents is null or _amount_cents <= 0 then
    raise exception 'invalid_withdrawal_amount' using errcode='22023';
  end if;
  if _idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode='22023';
  end if;

  select coalesce((value #>> '{}')::boolean,false)
    into v_enabled
  from public.app_settings
  where key='finance.driver_payouts_enabled';
  if not coalesce(v_enabled,false) then
    raise exception 'driver_payouts_not_homologated' using errcode='55000';
  end if;

  select coalesce(value #>> '{}','disabled')
    into v_target_provider
  from public.app_settings
  where key='finance.target_payout_provider';
  if coalesce(v_target_provider,'disabled') <> 'woovi' then
    raise exception 'payout_provider_not_woovi' using errcode='55000';
  end if;

  select coalesce((value #>> '{}')::bigint,2000)
    into v_min_cents
  from public.app_settings
  where key='finance.driver_min_withdrawal_cents';
  if _amount_cents < coalesce(v_min_cents,2000) then
    raise exception 'min_withdrawal_amount' using errcode='22023';
  end if;

  select d.* into v_driver
  from public.drivers d
  where d.user_id = public.mobility_user_id()
  limit 1;
  if v_driver.id is null then
    raise exception 'driver_not_found' using errcode='P0002';
  end if;
  if v_driver.approval_status <> 'aprovado'
     or v_driver.blocked_at is not null
     or v_driver.suspended_at is not null then
    raise exception 'driver_not_eligible_for_payout' using errcode='42501';
  end if;

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
      'idempotent',true
    );
  end if;

  if exists (
    select 1 from public.driver_withdrawals w
    where w.driver_id=v_driver.id and w.status in ('pending','processing')
  ) then
    raise exception 'withdrawal_already_in_progress' using errcode='55000';
  end if;

  select a.* into v_account
  from public.driver_payment_accounts a
  where a.driver_id=v_driver.id
    and a.provider='woovi'
    and a.status='active'
    and nullif(btrim(a.pix_key),'') is not null
    and nullif(btrim(a.provider_subaccount_id),'') is not null
  limit 1;
  if v_account.id is null then
    raise exception 'woovi_subaccount_not_active' using errcode='55000';
  end if;

  select w.* into v_wallet
  from public.driver_wallets w
  where w.driver_id=v_driver.id
  for update;
  if v_wallet.driver_id is null then
    raise exception 'driver_wallet_not_found' using errcode='P0002';
  end if;

  v_amount := round((_amount_cents::numeric / 100.0),2);
  if v_wallet.available_balance < v_amount or v_wallet.balance < v_amount then
    raise exception 'insufficient_available_balance' using errcode='22023';
  end if;

  insert into public.driver_withdrawals(
    driver_id, amount, status, provider, idempotency_key,
    pix_key, pix_holder_name, requested_at, updated_at
  ) values (
    v_driver.id, v_amount, 'pending', 'woovi', _idempotency_key,
    v_account.pix_key, v_driver.name, now(), now()
  ) returning * into v_withdrawal;

  update public.driver_wallets
  set balance=balance-v_amount,
      available_balance=available_balance-v_amount,
      updated_at=now()
  where driver_id=v_driver.id;

  insert into public.driver_wallet_transactions(
    driver_id, amount, direction, source, source_id, description
  ) values (
    v_driver.id, v_amount, 'debit', 'withdrawal', v_withdrawal.id,
    'Saque Pix Woovi solicitado'
  );

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(
    auth.uid(),
    'driver_withdrawal_requested',
    'driver_withdrawal',
    v_withdrawal.id::text,
    jsonb_build_object(
      'provider','woovi',
      'amount_cents',_amount_cents,
      'idempotency_key',_idempotency_key,
      'payment_account_id',v_account.id
    )
  );

  return jsonb_build_object(
    'withdrawalId',v_withdrawal.id,
    'status','pending',
    'provider','woovi',
    'amountCents',_amount_cents,
    'idempotent',false
  );
end;
$$;

revoke all on function apois_rpc_private.driver_request_withdrawal(bigint,uuid)
  from public, anon, authenticated;
grant execute on function apois_rpc_private.driver_request_withdrawal(bigint,uuid)
  to authenticated, service_role;

create or replace function public.mark_driver_withdrawal_processing(_withdrawal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;

  update public.driver_withdrawals
  set status='processing',
      processed_at=coalesce(processed_at,now()),
      updated_at=now()
  where id=_withdrawal_id and status='pending';
end;
$$;
revoke all on function public.mark_driver_withdrawal_processing(uuid) from public,anon,authenticated;
grant execute on function public.mark_driver_withdrawal_processing(uuid) to service_role;

create or replace function public.mark_driver_withdrawal_paid(
  _withdrawal_id uuid,
  _transfer_id text,
  _end_to_end_id text,
  _response jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  if exists(select 1 from public.driver_withdrawals where id=_withdrawal_id and status='paid') then
    return;
  end if;

  update public.driver_withdrawals
  set status='paid',
      provider='woovi',
      provider_transfer_id=coalesce(_transfer_id,provider_transfer_id),
      provider_end_to_end_id=coalesce(_end_to_end_id,provider_end_to_end_id),
      provider_response=_response,
      failure_reason=null,
      processed_at=coalesce(processed_at,now()),
      updated_at=now()
  where id=_withdrawal_id and status in ('pending','processing');

  if not found then
    raise exception 'withdrawal_not_payable' using errcode='55000';
  end if;
end;
$$;
revoke all on function public.mark_driver_withdrawal_paid(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.mark_driver_withdrawal_paid(uuid,text,text,jsonb) to service_role;

create or replace function public.mark_driver_withdrawal_failed(
  _withdrawal_id uuid,
  _reason text,
  _response jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_w public.driver_withdrawals%rowtype;
  v_refund_inserted uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;

  select * into v_w
  from public.driver_withdrawals
  where id=_withdrawal_id
  for update;
  if v_w.id is null then
    raise exception 'withdrawal_not_found' using errcode='P0002';
  end if;
  if v_w.status='failed' then return; end if;
  if v_w.status='paid' then
    raise exception 'paid_withdrawal_cannot_fail' using errcode='55000';
  end if;
  if v_w.status not in ('pending','processing') then
    raise exception 'withdrawal_not_refundable' using errcode='55000';
  end if;

  update public.driver_withdrawals
  set status='failed',
      provider='woovi',
      failure_reason=left(coalesce(_reason,'payout_failed'),1000),
      provider_response=_response,
      refunded_at=now(),
      processed_at=coalesce(processed_at,now()),
      updated_at=now()
  where id=_withdrawal_id;

  insert into public.driver_wallet_transactions(
    driver_id,amount,direction,source,source_id,description
  ) values (
    v_w.driver_id,v_w.amount,'credit','withdrawal_refund',v_w.id,
    'Estorno automático de saque Pix Woovi'
  )
  on conflict (driver_id,source,source_id) do nothing
  returning id into v_refund_inserted;

  if v_refund_inserted is not null then
    update public.driver_wallets
    set balance=balance+v_w.amount,
        available_balance=available_balance+v_w.amount,
        updated_at=now()
    where driver_id=v_w.driver_id;
  end if;
end;
$$;
revoke all on function public.mark_driver_withdrawal_failed(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mark_driver_withdrawal_failed(uuid,text,jsonb) to service_role;

comment on function apois_rpc_private.driver_request_withdrawal(bigint,uuid) is
  'Atomically reserves driver wallet funds for a Woovi subaccount withdrawal. Idempotent by driver withdrawal key.';
