alter table public.rides
  add column if not exists payment_status text,
  add column if not exists payment_provider text,
  add column if not exists provider_payment_id text,
  add column if not exists payment_confirmed_at timestamptz,
  add column if not exists initial_dispatch_claimed_at timestamptz;

alter table public.rides drop constraint if exists rides_status_check;
alter table public.rides
  add constraint rides_status_check check (status = any (array[
    'agendada'::text,
    'aguardando_pagamento'::text,
    'procurar_motorista'::text,
    'motorista_a_caminho'::text,
    'motorista_chegou'::text,
    'em_viagem'::text,
    'finalizada'::text,
    'cancelada_passageiro'::text,
    'cancelada_motorista'::text,
    'expired'::text
  ]));

alter table public.rides drop constraint if exists rides_payment_status_check;
alter table public.rides
  add constraint rides_payment_status_check check (
    payment_status is null or payment_status = any (array[
      'pending'::text,
      'paid'::text,
      'expired'::text,
      'failed'::text,
      'refunded'::text
    ])
  );

alter table public.ride_pix_payments
  alter column driver_id drop not null,
  alter column provider_payment_id drop not null,
  add column if not exists attempt_number integer not null default 1,
  add column if not exists external_reference text,
  add column if not exists pix_qr_code_base64 text;

alter table public.ride_pix_payments drop constraint if exists ride_pix_payments_ride_id_key;
alter table public.ride_pix_payments drop constraint if exists ride_pix_payments_status_check;
alter table public.ride_pix_payments
  add constraint ride_pix_payments_status_check check (status = any (array[
    'creating'::text,
    'pending'::text,
    'confirmed'::text,
    'received'::text,
    'overdue'::text,
    'expired'::text,
    'refunded'::text,
    'cancelled'::text,
    'failed'::text
  ]));

create unique index if not exists ride_pix_payments_ride_attempt_uidx
  on public.ride_pix_payments(ride_id, attempt_number);
create unique index if not exists ride_pix_payments_external_reference_uidx
  on public.ride_pix_payments(external_reference)
  where external_reference is not null;
create unique index if not exists ride_pix_payments_one_active_charge_uidx
  on public.ride_pix_payments(ride_id)
  where status in ('creating','pending','confirmed');

create or replace function private.enforce_prepaid_pix_dispatch_gate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(coalesce(new.payment_method,'')) = 'pix'
     and new.status in ('procurar_motorista','motorista_a_caminho','motorista_chegou','em_viagem')
     and coalesce(new.payment_status,'') <> 'paid' then
    raise exception 'pix_payment_required_before_dispatch' using errcode='23514';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_prepaid_pix_dispatch_gate() from public, anon, authenticated;

drop trigger if exists trg_enforce_prepaid_pix_dispatch_gate on public.rides;
create trigger trg_enforce_prepaid_pix_dispatch_gate
before insert or update of status, payment_method, payment_status on public.rides
for each row execute function private.enforce_prepaid_pix_dispatch_gate();

create or replace function public.activate_prepaid_pix_ride(
  _ride_id uuid,
  _provider_payment_id text
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
  v_transitioned boolean := false;
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
      'should_dispatch', (v_ride.status='procurar_motorista' and coalesce(v_ride.dispatch_attempts,0)=0)
    );
  end if;

  if v_ride.status <> 'aguardando_pagamento' then
    raise exception 'ride_not_awaiting_payment' using errcode='55000';
  end if;

  update public.rides
  set payment_status='paid',
      payment_provider='asaas',
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
    'should_dispatch', true
  );
end;
$$;
revoke all on function public.activate_prepaid_pix_ride(uuid,text) from public, anon, authenticated;
grant execute on function public.activate_prepaid_pix_ride(uuid,text) to service_role;

create or replace function public.claim_prepaid_pix_initial_dispatch(_ride_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed boolean := false;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;

  update public.rides
  set initial_dispatch_claimed_at=now(), updated_at=now()
  where id=_ride_id
    and payment_method='pix'
    and payment_status='paid'
    and status='procurar_motorista'
    and coalesce(dispatch_attempts,0)=0
    and (
      initial_dispatch_claimed_at is null
      or initial_dispatch_claimed_at < now()-interval '30 seconds'
    );
  v_claimed := found;
  return v_claimed;
end;
$$;
revoke all on function public.claim_prepaid_pix_initial_dispatch(uuid) from public, anon, authenticated;
grant execute on function public.claim_prepaid_pix_initial_dispatch(uuid) to service_role;

comment on column public.rides.payment_status is 'Server-controlled payment state. Pix must be paid before dispatch.';
comment on column public.rides.initial_dispatch_claimed_at is 'Lease used to prevent duplicate initial dispatch after prepaid Pix webhook retries.';
comment on column public.ride_pix_payments.attempt_number is 'Monotonic charge attempt for a ride; old attempts are preserved for webhook reconciliation.';
