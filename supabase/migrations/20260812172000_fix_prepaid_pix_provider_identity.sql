-- Keep prepaid Pix settlement aligned with the actual gateway.
-- The activation RPC is called by backend webhooks and must not hardcode Asaas.

create or replace function public.activate_prepaid_pix_ride(
  _ride_id uuid,
  _provider_payment_id text,
  _provider text default 'woovi'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ride public.rides%rowtype;
  v_payment public.ride_pix_payments%rowtype;
  v_expected_cents bigint;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;

  if _ride_id is null or nullif(btrim(_provider_payment_id),'') is null then
    raise exception 'invalid_payment_identity' using errcode='22023';
  end if;

  if lower(coalesce(_provider,'')) not in ('woovi','asaas') then
    raise exception 'invalid_payment_provider' using errcode='22023';
  end if;

  select * into v_ride from public.rides where id=_ride_id for update;
  if not found then raise exception 'ride_not_found' using errcode='P0002'; end if;

  select * into v_payment
  from public.ride_pix_payments
  where ride_id=_ride_id and provider_payment_id=_provider_payment_id
  for update;

  if not found then raise exception 'ride_pix_payment_not_found' using errcode='P0002'; end if;
  if v_payment.status <> 'received' then
    raise exception 'ride_pix_payment_not_received' using errcode='55000';
  end if;

  v_expected_cents := round(v_ride.estimated_price * 100)::bigint;
  if v_payment.amount_cents <> v_expected_cents then
    raise exception 'ride_pix_amount_mismatch' using errcode='22023';
  end if;

  if v_ride.payment_status = 'paid' then
    return jsonb_build_object('ok', true, 'duplicate', true, 'should_dispatch', false);
  end if;

  if v_ride.status <> 'aguardando_pagamento' then
    raise exception 'ride_not_awaiting_payment' using errcode='55000';
  end if;

  update public.rides
  set payment_status='paid',
      payment_provider=lower(_provider),
      provider_payment_id=_provider_payment_id,
      payment_confirmed_at=coalesce(payment_confirmed_at,now()),
      status='procurar_motorista',
      search_expires_at=now()+interval '180 seconds',
      updated_at=now()
  where id=_ride_id;

  return jsonb_build_object('ok', true, 'duplicate', false, 'should_dispatch', true);
end;
$$;

revoke all on function public.activate_prepaid_pix_ride(uuid,text,text) from public, anon, authenticated;
grant execute on function public.activate_prepaid_pix_ride(uuid,text,text) to service_role;
