-- APOIS CORRIDAS: make passenger cancellation + fee + wallet block atomic.
-- This migration is intentionally idempotent for existing cancellation data.

create or replace function public.service_cancel_passenger_ride(
  _auth_user_id uuid,
  _ride_id uuid,
  _reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_passenger_id uuid;
  v_ride public.rides%rowtype;
  v_reason text;
  v_free_minutes numeric := 2;
  v_configured_fee numeric := 5;
  v_elapsed_minutes numeric := 0;
  v_fee numeric := 0;
begin
  if _auth_user_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'unauthorized');
  end if;

  if _ride_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_ride_id');
  end if;

  select u.id
    into v_passenger_id
  from public.users u
  where u.auth_user_id = _auth_user_id
    and u.deleted_at is null
  limit 1;

  if v_passenger_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'passenger_profile_missing');
  end if;

  -- Serialize ride creation and cancellation-fee changes for this passenger.
  perform public.apois_lock_passenger_ride_financial_gate(v_passenger_id);

  select *
    into v_ride
  from public.rides r
  where r.id = _ride_id
    and r.passenger_id = v_passenger_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'ride_not_found',
      'message', 'Corrida não encontrada.'
    );
  end if;

  if v_ride.status in ('finalizada', 'cancelada_passageiro', 'cancelada_motorista', 'expired') then
    return jsonb_build_object(
      'ok', true,
      'status', v_ride.status,
      'cancellation_fee', coalesce(v_ride.cancellation_fee, 0),
      'message', 'A corrida já está encerrada.'
    );
  end if;

  if v_ride.status in ('motorista_chegou', 'em_viagem') then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'cancellation_not_allowed',
      'status', v_ride.status,
      'message', 'Não é possível cancelar depois que o motorista chegou ao local de embarque.'
    );
  end if;

  if v_ride.status not in ('procurar_motorista', 'motorista_a_caminho', 'agendada') then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'invalid_ride_status',
      'status', v_ride.status
    );
  end if;

  select case
           when (s.value #>> '{}') ~ '^[0-9]+([.][0-9]+)?$'
             then (s.value #>> '{}')::numeric
           else null
         end
    into v_free_minutes
  from public.app_settings s
  where s.key = 'ride.cancellation_free_minutes'
  limit 1;
  v_free_minutes := coalesce(v_free_minutes, 2);

  select case
           when (s.value #>> '{}') ~ '^[0-9]+([.][0-9]+)?$'
             then (s.value #>> '{}')::numeric
           else null
         end
    into v_configured_fee
  from public.app_settings s
  where s.key = 'ride.cancellation_fee_amount'
  limit 1;
  v_configured_fee := coalesce(v_configured_fee, 5);

  if v_ride.status = 'motorista_a_caminho' then
    v_elapsed_minutes := greatest(
      0,
      extract(epoch from (clock_timestamp() - coalesce(v_ride.accepted_at, v_ride.created_at))) / 60.0
    );

    if v_elapsed_minutes > v_free_minutes then
      v_fee := round(greatest(v_configured_fee, 0), 2);
    end if;
  end if;

  v_reason := left(trim(coalesce(_reason, '')), 500);
  if v_reason = '' then
    v_reason := 'Cancelada pelo passageiro';
  end if;

  update public.rides
  set status = 'cancelada_passageiro',
      cancelled_by = 'passenger',
      cancellation_reason = v_reason,
      cancellation_fee = v_fee,
      cancelled_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = v_ride.id;

  if v_fee > 0 then
    insert into public.cancellation_fees (
      ride_id,
      passenger_id,
      amount,
      reason,
      status,
      is_paid,
      paid_at,
      updated_at
    ) values (
      v_ride.id,
      v_passenger_id,
      v_fee,
      v_reason,
      'pending',
      false,
      null,
      clock_timestamp()
    )
    on conflict (ride_id) where ride_id is not null do nothing;

    insert into public.passenger_wallets (
      passenger_id,
      is_blocked,
      blocked_reason,
      updated_at
    ) values (
      v_passenger_id,
      true,
      'Há taxa de cancelamento pendente.',
      clock_timestamp()
    )
    on conflict (passenger_id) do update
      set is_blocked = true,
          blocked_reason = 'Há taxa de cancelamento pendente.',
          updated_at = excluded.updated_at;
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', 'cancelada_passageiro',
    'cancellation_fee', v_fee,
    'message', case
      when v_fee > 0 then format('Corrida cancelada. Foi aplicada uma taxa de R$ %s.', replace(to_char(v_fee, 'FM999999990.00'), '.', ','))
      else 'Corrida cancelada sem taxa.'
    end
  );
end;
$$;

revoke all on function public.service_cancel_passenger_ride(uuid, uuid, text) from public;
revoke all on function public.service_cancel_passenger_ride(uuid, uuid, text) from anon;
revoke all on function public.service_cancel_passenger_ride(uuid, uuid, text) from authenticated;
grant execute on function public.service_cancel_passenger_ride(uuid, uuid, text) to service_role;

comment on function public.service_cancel_passenger_ride(uuid, uuid, text)
is 'Service-role-only atomic passenger cancellation. Serializes against ride creation and creates cancellation debt + wallet block in the same transaction.';

-- Reconcile historical rows created by the former multi-request flow: a ride may
-- already contain a positive cancellation_fee while the debt row was never created.
insert into public.cancellation_fees (
  ride_id,
  passenger_id,
  amount,
  reason,
  status,
  is_paid,
  paid_at,
  created_at,
  updated_at
)
select
  r.id,
  r.passenger_id,
  r.cancellation_fee,
  coalesce(nullif(trim(r.cancellation_reason), ''), 'Cancelada pelo passageiro'),
  'pending',
  false,
  null,
  coalesce(r.cancelled_at, r.updated_at, r.created_at, now()),
  now()
from public.rides r
where r.status = 'cancelada_passageiro'
  and coalesce(r.cancellation_fee, 0) > 0
  and not exists (
    select 1
    from public.cancellation_fees cf
    where cf.ride_id = r.id
  )
on conflict (ride_id) where ride_id is not null do nothing;

-- Keep the wallet projection consistent with the authoritative pending-fee rows.
insert into public.passenger_wallets (
  passenger_id,
  is_blocked,
  blocked_reason,
  updated_at
)
select distinct
  cf.passenger_id,
  true,
  'Há taxa de cancelamento pendente.',
  now()
from public.cancellation_fees cf
where cf.is_paid is not true
  and cf.paid_at is null
  and lower(coalesce(cf.status, 'pending')) not in (
    'paid', 'pago', 'cancelled', 'canceled', 'cancelada',
    'waived', 'forgiven', 'perdoada'
  )
on conflict (passenger_id) do update
  set is_blocked = true,
      blocked_reason = 'Há taxa de cancelamento pendente.',
      updated_at = excluded.updated_at;
