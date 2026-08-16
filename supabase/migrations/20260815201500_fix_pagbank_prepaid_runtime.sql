-- Complete the PagBank prepaid Pix cutover in the provider-neutral runtime.
-- Production remains protected by app_settings; this migration only teaches the
-- canonical gates/activation RPC that pagbank is a supported provider.

create or replace function private.enforce_new_ride_pix_provider()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_target_provider text := 'asaas';
  v_ride_provider text;
begin
  select lower(coalesce(value #>> '{}', 'asaas'))
    into v_target_provider
  from public.app_settings
  where key = 'finance.target_electronic_payment_provider';

  v_target_provider := coalesce(v_target_provider, 'asaas');
  if v_target_provider not in ('asaas', 'woovi', 'pagbank') then
    raise exception 'electronic_payment_provider_not_supported' using errcode = '55000';
  end if;

  if lower(coalesce(new.provider, '')) <> v_target_provider then
    raise exception 'electronic_payment_provider_not_active' using errcode = '55000';
  end if;

  select lower(coalesce(r.payment_provider, ''))
    into v_ride_provider
  from public.rides r
  where r.id = new.ride_id;

  if v_ride_provider is null or v_ride_provider = '' then
    raise exception 'ride_payment_provider_missing' using errcode = '55000';
  end if;

  if v_ride_provider <> lower(new.provider) then
    raise exception 'ride_payment_provider_mismatch' using errcode = '55000';
  end if;

  return new;
end;
$function$;

create or replace function public.activate_prepaid_pix_ride(
  _ride_id uuid,
  _provider_payment_id text,
  _provider text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ride public.rides%rowtype;
  v_payment public.ride_pix_payments%rowtype;
  v_provider text := lower(btrim(coalesce(_provider, '')));
  v_expected_cents bigint;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  if _ride_id is null or nullif(btrim(_provider_payment_id), '') is null then
    raise exception 'invalid_payment_identity' using errcode = '22023';
  end if;

  if v_provider not in ('asaas', 'woovi', 'pagbank') then
    raise exception 'invalid_payment_provider' using errcode = '22023';
  end if;

  select *
    into v_ride
  from public.rides
  where id = _ride_id
  for update;

  if not found then
    raise exception 'ride_not_found' using errcode = 'P0002';
  end if;

  if lower(coalesce(v_ride.payment_method, '')) <> 'pix' then
    raise exception 'ride_payment_method_not_pix' using errcode = '22023';
  end if;

  select *
    into v_payment
  from public.ride_pix_payments
  where ride_id = _ride_id
    and provider = v_provider
    and provider_payment_id = _provider_payment_id
  for update;

  if not found then
    raise exception 'ride_pix_payment_not_found' using errcode = 'P0002';
  end if;

  if v_payment.status <> 'received' then
    raise exception 'ride_pix_payment_not_received' using errcode = '55000';
  end if;

  v_expected_cents := case
    when v_provider in ('woovi', 'pagbank') then
      coalesce(v_ride.passenger_charge_cents, round(v_ride.estimated_price * 100)::bigint)
    else
      round(v_ride.estimated_price * 100)::bigint
  end;

  if v_payment.amount_cents <> v_expected_cents then
    raise exception 'ride_pix_amount_mismatch' using errcode = '22023';
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
      'should_dispatch', (
        v_ride.status = 'procurar_motorista'
        and coalesce(v_ride.dispatch_attempts, 0) = 0
      )
    );
  end if;

  if v_ride.status <> 'aguardando_pagamento' then
    raise exception 'ride_not_awaiting_payment' using errcode = '55000';
  end if;

  update public.rides
  set payment_status = 'paid',
      payment_provider = v_provider,
      provider_payment_id = _provider_payment_id,
      payment_confirmed_at = coalesce(payment_confirmed_at, now()),
      status = 'procurar_motorista',
      search_expires_at = now() + interval '180 seconds',
      updated_at = now()
  where id = _ride_id
  returning * into v_ride;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'transitioned', true,
    'ride_id', v_ride.id,
    'status', v_ride.status,
    'payment_status', v_ride.payment_status,
    'should_dispatch', true
  );
end;
$function$;
