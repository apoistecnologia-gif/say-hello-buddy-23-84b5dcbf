-- APOIS Corridas — protect provider-backed funds when driver changes Pix key.
-- A Woovi subaccount is tied to the Pix destination used when it was created.
-- Never move the canonical destination while funds or provider credits are in
-- flight, otherwise the app wallet could represent money held in two different
-- subaccounts.

create or replace function apois_rpc_private.driver_set_payout_destination(
  _pix_key text,
  _pix_key_type text,
  _holder_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_driver_id uuid;
  v_type text := upper(btrim(coalesce(_pix_key_type, '')));
  v_key text := btrim(coalesce(_pix_key, ''));
  v_normalized text;
  v_previous public.driver_payout_destinations%rowtype;
  v_wallet public.driver_wallets%rowtype;
  v_changed boolean := false;
  v_has_woovi_binding boolean := false;
  v_available_at timestamptz;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;

  select d.id into v_driver_id
  from public.drivers d
  where d.user_id=public.mobility_user_id()
  limit 1;
  if v_driver_id is null then raise exception 'driver_not_found' using errcode='P0002'; end if;

  if v_type not in ('CPF','CNPJ','EMAIL','PHONE','EVP') then
    raise exception 'invalid_pix_key_type' using errcode='22023';
  end if;

  if v_type in ('CPF','CNPJ','PHONE') then
    v_normalized := regexp_replace(v_key,'[^0-9+]','','g');
  elsif v_type='EMAIL' then
    v_normalized := lower(v_key);
  else
    v_normalized := v_key;
  end if;

  if v_type='CPF' and regexp_replace(v_normalized,'[^0-9]','','g') !~ '^[0-9]{11}$' then
    raise exception 'invalid_pix_cpf' using errcode='22023';
  elsif v_type='CNPJ' and regexp_replace(v_normalized,'[^0-9]','','g') !~ '^[0-9]{14}$' then
    raise exception 'invalid_pix_cnpj' using errcode='22023';
  elsif v_type='EMAIL' and v_normalized !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid_pix_email' using errcode='22023';
  elsif v_type='PHONE' then
    v_normalized := regexp_replace(v_normalized,'[^0-9]','','g');
    if v_normalized !~ '^[0-9]{10,13}$' then raise exception 'invalid_pix_phone' using errcode='22023'; end if;
  elsif v_type='EVP' and (length(v_normalized)<20 or length(v_normalized)>100) then
    raise exception 'invalid_pix_evp' using errcode='22023';
  end if;

  select * into v_previous
  from public.driver_payout_destinations
  where driver_id=v_driver_id
  for update;

  v_changed := v_previous.driver_id is null
    or v_previous.pix_key is distinct from v_normalized
    or v_previous.pix_key_type is distinct from v_type;

  if v_changed then
    select exists(
      select 1
      from public.driver_payment_accounts a
      where a.driver_id=v_driver_id
        and a.provider='woovi'
        and nullif(btrim(a.provider_subaccount_id),'') is not null
    ) into v_has_woovi_binding;

    if v_has_woovi_binding then
      select * into v_wallet
      from public.driver_wallets
      where driver_id=v_driver_id
      for update;

      if coalesce(v_wallet.balance,0) > 0
         or coalesce(v_wallet.pending_balance,0) > 0
         or exists(
           select 1
           from public.driver_provider_credits c
           where c.driver_id=v_driver_id
             and c.provider='woovi'
             and c.status in ('pending','processing')
         ) then
        raise exception 'withdraw_balance_before_pix_change' using errcode='55000';
      end if;
    end if;
  end if;

  v_available_at := case
    when v_changed then now()+interval '24 hours'
    else coalesce(v_previous.payout_available_at,now())
  end;

  insert into public.driver_payout_destinations(
    driver_id,pix_key,pix_key_type,holder_name,confirmed_at,payout_available_at,created_at,updated_at
  ) values (
    v_driver_id,v_normalized,v_type,nullif(btrim(coalesce(_holder_name,'')),''),now(),v_available_at,now(),now()
  )
  on conflict(driver_id) do update set
    pix_key=excluded.pix_key,
    pix_key_type=excluded.pix_key_type,
    holder_name=excluded.holder_name,
    confirmed_at=excluded.confirmed_at,
    payout_available_at=excluded.payout_available_at,
    updated_at=now();

  if v_changed then
    update public.driver_payment_accounts
    set pix_key=v_normalized,
        provider_subaccount_id=null,
        status='pending',
        verified_at=null,
        updated_at=now()
    where driver_id=v_driver_id and provider='woovi';
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(
    auth.uid(),
    case when v_changed then 'driver_payout_destination_changed' else 'driver_payout_destination_confirmed' end,
    'driver_payout_destination',
    v_driver_id::text,
    jsonb_build_object(
      'pix_key_type',v_type,
      'changed',v_changed,
      'payout_available_at',v_available_at,
      'woovi_binding_invalidated',v_changed,
      'provider_balance_guard',true
    )
  );

  return jsonb_build_object(
    'ok',true,
    'pixKeyType',v_type,
    'confirmedAt',now(),
    'payoutAvailableAt',v_available_at,
    'cooldownApplied',v_changed
  );
end;
$$;

comment on function apois_rpc_private.driver_set_payout_destination(text,text,text) is
  'Canonical Pix destination change with validation, audit, 24h cooldown and Woovi provider-balance protection.';
