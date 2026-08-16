begin;

-- FASE 6 / Passageiro: sharing seguro, SOS operacional, avaliação e recibo server-side.
-- Alterações aditivas e idempotentes; não removem dados existentes.

alter table public.rides
  add column if not exists share_expires_at timestamptz,
  add column if not exists share_revoked_at timestamptz;

create unique index if not exists rides_share_token_unique_idx
  on public.rides (share_token)
  where share_token is not null;

alter table public.sos_alerts
  add column if not exists ride_id uuid references public.rides(id) on delete set null,
  add column if not exists severity text not null default 'critical';

create index if not exists sos_alerts_ride_created_idx
  on public.sos_alerts (ride_id, created_at desc);

create index if not exists sos_alerts_status_created_idx
  on public.sos_alerts (status, created_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sos_alerts_severity_check'
      and conrelid = 'public.sos_alerts'::regclass
  ) then
    alter table public.sos_alerts
      add constraint sos_alerts_severity_check
      check (severity in ('critical', 'high', 'medical', 'security')) not valid;
    alter table public.sos_alerts validate constraint sos_alerts_severity_check;
  end if;
end
$$;

create or replace function public.create_passenger_share_token(_ride_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_passenger_id uuid;
  v_ride public.rides%rowtype;
  v_ttl_minutes integer := 720;
  v_setting jsonb;
begin
  v_passenger_id := public.mobility_user_id();
  if v_passenger_id is null then
    raise exception 'unauthorized';
  end if;

  select value into v_setting
  from public.app_settings
  where key = 'ride.share_ttl_minutes'
  limit 1;

  if v_setting is not null then
    begin
      if jsonb_typeof(v_setting) = 'number' then
        v_ttl_minutes := greatest(15, least(1440, (v_setting::text)::integer));
      elsif jsonb_typeof(v_setting) = 'string' and (v_setting #>> '{}') ~ '^[0-9]+$' then
        v_ttl_minutes := greatest(15, least(1440, (v_setting #>> '{}')::integer));
      end if;
    exception when others then
      v_ttl_minutes := 720;
    end;
  end if;

  select * into v_ride
  from public.rides
  where id = _ride_id
    and passenger_id = v_passenger_id
  for update;

  if not found then
    raise exception 'ride_not_found';
  end if;

  if v_ride.status not in ('motorista_a_caminho', 'motorista_chegou', 'em_viagem') then
    raise exception 'ride_not_shareable';
  end if;

  if v_ride.share_token is null
     or v_ride.share_revoked_at is not null
     or v_ride.share_expires_at is null
     or v_ride.share_expires_at <= now() then
    update public.rides
    set share_token = gen_random_uuid(),
        share_expires_at = now() + make_interval(mins => v_ttl_minutes),
        share_revoked_at = null,
        updated_at = now()
    where id = _ride_id
    returning * into v_ride;
  end if;

  return jsonb_build_object(
    'ok', true,
    'ride_id', v_ride.id,
    'share_token', v_ride.share_token,
    'expires_at', v_ride.share_expires_at
  );
end;
$$;

create or replace function public.revoke_passenger_share_token(_ride_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_passenger_id uuid;
  v_token uuid;
begin
  v_passenger_id := public.mobility_user_id();
  if v_passenger_id is null then
    raise exception 'unauthorized';
  end if;

  update public.rides
  set share_revoked_at = now(),
      updated_at = now()
  where id = _ride_id
    and passenger_id = v_passenger_id
  returning share_token into v_token;

  if not found then
    raise exception 'ride_not_found';
  end if;

  return jsonb_build_object('ok', true, 'ride_id', _ride_id, 'revoked', true, 'share_token', v_token);
end;
$$;

create or replace function public.get_shared_passenger_ride(_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides%rowtype;
begin
  select * into v_ride
  from public.rides
  where share_token = _token
    and share_revoked_at is null
    and share_expires_at is not null
    and share_expires_at > now()
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'shared_ride_not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'ride', jsonb_build_object(
      'status', v_ride.status,
      'category', v_ride.category,
      'origin_name', v_ride.origin_name,
      'destination_name', v_ride.destination_name,
      'driver_name', v_ride.driver_name,
      'driver_vehicle_model', v_ride.driver_vehicle_model,
      'driver_vehicle_color', v_ride.driver_vehicle_color,
      'driver_vehicle_plate', v_ride.driver_vehicle_plate,
      'driver_latitude', v_ride.driver_latitude,
      'driver_longitude', v_ride.driver_longitude,
      'driver_heading', v_ride.driver_heading,
      'created_at', v_ride.created_at,
      'accepted_at', v_ride.accepted_at,
      'driver_arrived_at', v_ride.driver_arrived_at,
      'started_at', v_ride.started_at,
      'completed_at', v_ride.completed_at,
      'updated_at', v_ride.updated_at
    )
  );
end;
$$;

create or replace function public.rate_passenger_ride(
  _ride_id uuid,
  _rating integer,
  _comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_passenger_id uuid;
  v_ride public.rides%rowtype;
  v_average numeric;
  v_count bigint;
  v_comment text;
begin
  v_passenger_id := public.mobility_user_id();
  if v_passenger_id is null then
    raise exception 'unauthorized';
  end if;
  if _rating < 1 or _rating > 5 then
    raise exception 'rating_out_of_range';
  end if;

  v_comment := nullif(left(trim(coalesce(_comment, '')), 500), '');

  select * into v_ride
  from public.rides
  where id = _ride_id
    and passenger_id = v_passenger_id
  for update;

  if not found then
    raise exception 'ride_not_found';
  end if;
  if v_ride.status <> 'finalizada' then
    raise exception 'ride_not_completed';
  end if;
  if v_ride.driver_id is null then
    raise exception 'ride_driver_missing';
  end if;
  if v_ride.passenger_rating is not null then
    raise exception 'ride_already_rated';
  end if;

  update public.rides
  set passenger_rating = _rating,
      passenger_rating_comment = v_comment,
      updated_at = now()
  where id = _ride_id
    and passenger_id = v_passenger_id
    and passenger_rating is null;

  if not found then
    raise exception 'ride_already_rated';
  end if;

  select round(avg(passenger_rating)::numeric, 2), count(*)
  into v_average, v_count
  from public.rides
  where driver_id = v_ride.driver_id
    and status = 'finalizada'
    and passenger_rating is not null;

  update public.drivers
  set rating = v_average,
      total_ratings = v_count::integer,
      updated_at = now()
  where id = v_ride.driver_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (
    v_passenger_id,
    'ride.rating.passenger_to_driver',
    'ride',
    _ride_id::text,
    jsonb_build_object('rating', _rating, 'driver_id', v_ride.driver_id, 'comment_saved', v_comment is not null)
  );

  return jsonb_build_object(
    'ok', true,
    'ride_id', _ride_id,
    'rating', _rating,
    'comment_saved', v_comment is not null,
    'driver_average_rating', v_average,
    'driver_ratings_count', v_count
  );
end;
$$;

create or replace function public.create_passenger_sos(
  _ride_id uuid,
  _lat numeric default null,
  _lng numeric default null,
  _severity text default 'critical',
  _message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_passenger_id uuid;
  v_ride public.rides%rowtype;
  v_alert_id uuid;
  v_severity text;
  v_message text;
begin
  v_passenger_id := public.mobility_user_id();
  if v_passenger_id is null then
    raise exception 'unauthorized';
  end if;

  v_severity := lower(trim(coalesce(_severity, 'critical')));
  if v_severity not in ('critical', 'high', 'medical', 'security') then
    raise exception 'invalid_sos_severity';
  end if;
  if _lat is not null and (_lat < -90 or _lat > 90) then
    raise exception 'invalid_sos_location';
  end if;
  if _lng is not null and (_lng < -180 or _lng > 180) then
    raise exception 'invalid_sos_location';
  end if;

  select * into v_ride
  from public.rides
  where id = _ride_id
    and passenger_id = v_passenger_id
  for share;

  if not found then
    raise exception 'ride_not_found';
  end if;
  if v_ride.status not in ('motorista_a_caminho', 'motorista_chegou', 'em_viagem') then
    raise exception 'ride_not_active';
  end if;

  v_message := nullif(left(trim(coalesce(_message, 'SOS acionado pelo passageiro durante corrida ativa.')), 500), '');

  insert into public.sos_alerts(user_id, driver_id, ride_id, lat, lng, message, severity, status)
  values (v_passenger_id, v_ride.driver_id, v_ride.id, _lat, _lng, v_message, v_severity, 'open')
  returning id into v_alert_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (
    v_passenger_id,
    'sos.passenger.created',
    'ride',
    v_ride.id::text,
    jsonb_build_object(
      'sos_alert_id', v_alert_id,
      'severity', v_severity,
      'status', 'open',
      'lat', _lat,
      'lng', _lng,
      'driver_id', v_ride.driver_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'alert_id', v_alert_id,
    'ride_id', v_ride.id,
    'severity', v_severity,
    'status', 'open',
    'created_at', now()
  );
end;
$$;

create or replace function public.get_passenger_ride_receipt(_ride_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_passenger_id uuid;
  v_ride public.rides%rowtype;
begin
  v_passenger_id := public.mobility_user_id();
  if v_passenger_id is null then
    raise exception 'unauthorized';
  end if;

  select * into v_ride
  from public.rides
  where id = _ride_id
    and passenger_id = v_passenger_id
  limit 1;

  if not found then
    raise exception 'ride_not_found';
  end if;

  return jsonb_build_object(
    'ok', true,
    'source', 'server',
    'ride', to_jsonb(v_ride)
  );
end;
$$;

revoke all on function public.create_passenger_share_token(uuid) from public;
revoke all on function public.revoke_passenger_share_token(uuid) from public;
revoke all on function public.rate_passenger_ride(uuid, integer, text) from public;
revoke all on function public.create_passenger_sos(uuid, numeric, numeric, text, text) from public;
revoke all on function public.get_passenger_ride_receipt(uuid) from public;
revoke all on function public.get_shared_passenger_ride(uuid) from public;

grant execute on function public.create_passenger_share_token(uuid) to authenticated;
grant execute on function public.revoke_passenger_share_token(uuid) to authenticated;
grant execute on function public.rate_passenger_ride(uuid, integer, text) to authenticated;
grant execute on function public.create_passenger_sos(uuid, numeric, numeric, text, text) to authenticated;
grant execute on function public.get_passenger_ride_receipt(uuid) to authenticated;
grant execute on function public.get_shared_passenger_ride(uuid) to anon, authenticated;

drop policy if exists sos_alerts_admin_read on public.sos_alerts;
create policy sos_alerts_admin_read
on public.sos_alerts
for select
to authenticated
using (private.has_permission('users.manage'));

commit;
