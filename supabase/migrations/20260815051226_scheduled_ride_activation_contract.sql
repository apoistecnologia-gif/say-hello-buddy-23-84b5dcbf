alter table public.rides
  add column if not exists scheduled_activated_at timestamptz;

create or replace function private.enforce_scheduled_ride_contract()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.status <> 'agendada' then
    return new;
  end if;

  if new.scheduled_for is null then
    raise exception 'scheduled_for_required' using errcode = '23514';
  end if;

  if lower(coalesce(new.payment_method, '')) = 'pix' then
    raise exception 'scheduled_pix_requires_business_rule' using errcode = '23514';
  end if;

  if new.driver_id is not null or new.accepted_driver_id is not null then
    raise exception 'scheduled_ride_cannot_have_driver' using errcode = '23514';
  end if;

  if cardinality(coalesce(new.candidate_driver_ids, '{}'::uuid[])) > 0
     or cardinality(coalesce(new.offered_driver_ids, '{}'::uuid[])) > 0
     or new.current_offer_driver_id is not null then
    raise exception 'scheduled_ride_cannot_have_active_offer' using errcode = '23514';
  end if;

  if tg_op = 'INSERT'
     or old.status is distinct from 'agendada'
     or old.scheduled_for is distinct from new.scheduled_for then
    if new.scheduled_for < statement_timestamp() + interval '15 minutes' then
      raise exception 'scheduled_too_soon' using errcode = '23514';
    end if;
    if new.scheduled_for > statement_timestamp() + interval '30 days' then
      raise exception 'scheduled_too_far' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function private.enforce_scheduled_ride_contract() from public, anon, authenticated, service_role;

drop trigger if exists trg_rides_scheduled_contract on public.rides;
create trigger trg_rides_scheduled_contract
before insert or update of status, scheduled_for, payment_method, driver_id, accepted_driver_id,
  candidate_driver_ids, offered_driver_ids, current_offer_driver_id
on public.rides
for each row
execute function private.enforce_scheduled_ride_contract();

create or replace function public.activate_due_scheduled_rides(
  _lead_minutes integer default 15,
  _limit integer default 100
)
returns table(ride_id uuid, schedule_status text)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_lead integer := greatest(0, least(coalesce(_lead_minutes, 15), 60));
  v_limit integer := greatest(1, least(coalesce(_limit, 100), 500));
begin
  return query
  with due as (
    select r.id, r.scheduled_for
    from public.rides r
    where r.status = 'agendada'
      and r.scheduled_for is not null
      and r.scheduled_for <= v_now + make_interval(mins => v_lead)
    order by r.scheduled_for asc, r.id asc
    for update skip locked
    limit v_limit
  ), updated as (
    update public.rides r
    set status = case
          when d.scheduled_for < v_now - interval '2 hours' then 'expired'
          else 'procurar_motorista'
        end,
        scheduled_activated_at = case
          when d.scheduled_for < v_now - interval '2 hours' then r.scheduled_activated_at
          else coalesce(r.scheduled_activated_at, v_now)
        end,
        search_expires_at = case
          when d.scheduled_for < v_now - interval '2 hours' then null
          else v_now + interval '3 minutes'
        end,
        request_expires_at = null,
        candidate_driver_ids = '{}'::uuid[],
        offered_driver_ids = '{}'::uuid[],
        rejected_driver_ids = '{}'::uuid[],
        current_offer_driver_id = null,
        cancellation_reason = case
          when d.scheduled_for < v_now - interval '2 hours'
            then 'Agendamento expirado antes do despacho.'
          else r.cancellation_reason
        end,
        cancelled_by = case
          when d.scheduled_for < v_now - interval '2 hours' then 'system'
          else r.cancelled_by
        end,
        cancelled_at = case
          when d.scheduled_for < v_now - interval '2 hours' then v_now
          else r.cancelled_at
        end,
        updated_at = v_now
    from due d
    where r.id = d.id
      and r.status = 'agendada'
    returning r.id,
      case when r.status = 'expired' then 'expired' else 'activated' end as schedule_status
  )
  select u.id, u.schedule_status
  from updated u;
end;
$function$;

revoke all on function public.activate_due_scheduled_rides(integer, integer) from public, anon, authenticated;
grant execute on function public.activate_due_scheduled_rides(integer, integer) to service_role;
