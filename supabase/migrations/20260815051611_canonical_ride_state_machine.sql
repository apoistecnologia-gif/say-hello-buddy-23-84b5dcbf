create or replace function private.enforce_ride_state_machine()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_allowed boolean := false;
begin
  if tg_op = 'INSERT' then
    if new.status not in ('agendada', 'aguardando_pagamento', 'procurar_motorista') then
      raise exception 'invalid_initial_ride_status:%', new.status using errcode = '23514';
    end if;
  elsif new.status is distinct from old.status then
    if old.status in ('finalizada', 'cancelada_passageiro', 'cancelada_motorista', 'expired') then
      raise exception 'terminal_ride_cannot_transition:%->%', old.status, new.status using errcode = '23514';
    end if;

    v_allowed := case old.status
      when 'agendada' then new.status in ('procurar_motorista', 'cancelada_passageiro', 'expired')
      when 'aguardando_pagamento' then new.status in ('procurar_motorista', 'cancelada_passageiro', 'expired')
      when 'procurar_motorista' then new.status in ('motorista_a_caminho', 'cancelada_passageiro', 'expired')
      when 'motorista_a_caminho' then new.status in ('motorista_chegou', 'procurar_motorista', 'cancelada_passageiro')
      when 'motorista_chegou' then new.status in ('em_viagem', 'procurar_motorista', 'cancelada_motorista')
      when 'em_viagem' then new.status = 'finalizada'
      else false
    end;

    if not v_allowed then
      raise exception 'invalid_ride_transition:%->%', old.status, new.status using errcode = '23514';
    end if;
  end if;

  if new.status in ('agendada', 'aguardando_pagamento') then
    if new.driver_id is not null or new.accepted_driver_id is not null then
      raise exception 'ride_stage_forbids_driver:%', new.status using errcode = '23514';
    end if;
  elsif new.status = 'procurar_motorista' then
    if new.driver_id is null then
      if new.accepted_driver_id is not null or new.queued_after_ride_id is not null then
        raise exception 'searching_ride_driver_metadata_inconsistent' using errcode = '23514';
      end if;
    else
      if new.accepted_driver_id is distinct from new.driver_id
         or new.queued_after_ride_id is null then
        raise exception 'queued_ride_driver_metadata_inconsistent' using errcode = '23514';
      end if;
    end if;
  elsif new.status = 'motorista_a_caminho' then
    if new.driver_id is null
       or new.accepted_driver_id is distinct from new.driver_id
       or new.accepted_at is null
       or new.queued_after_ride_id is not null then
      raise exception 'accepted_ride_metadata_inconsistent' using errcode = '23514';
    end if;
  elsif new.status = 'motorista_chegou' then
    if new.driver_id is null
       or new.accepted_driver_id is distinct from new.driver_id
       or new.accepted_at is null
       or new.driver_arrived_at is null then
      raise exception 'arrived_ride_metadata_inconsistent' using errcode = '23514';
    end if;
  elsif new.status = 'em_viagem' then
    if new.driver_id is null
       or new.accepted_driver_id is distinct from new.driver_id
       or new.accepted_at is null
       or new.driver_arrived_at is null
       or new.started_at is null then
      raise exception 'in_progress_ride_metadata_inconsistent' using errcode = '23514';
    end if;
  elsif new.status = 'finalizada' then
    if new.driver_id is null
       or new.accepted_driver_id is distinct from new.driver_id
       or new.started_at is null
       or new.completed_at is null then
      raise exception 'completed_ride_metadata_inconsistent' using errcode = '23514';
    end if;
  elsif new.status = 'cancelada_passageiro' then
    if new.cancelled_at is null or new.cancelled_by <> 'passenger' then
      raise exception 'passenger_cancel_metadata_inconsistent' using errcode = '23514';
    end if;
  elsif new.status = 'cancelada_motorista' then
    if new.cancelled_at is null or new.cancelled_by <> 'driver' then
      raise exception 'driver_cancel_metadata_inconsistent' using errcode = '23514';
    end if;
  elsif new.status = 'expired' then
    if new.cancelled_at is null or new.cancelled_by <> 'system' then
      raise exception 'expired_ride_metadata_inconsistent' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function private.enforce_ride_state_machine() from public, anon, authenticated, service_role;

drop trigger if exists trg_rides_state_machine on public.rides;
create trigger trg_rides_state_machine
before insert or update of status, driver_id, accepted_driver_id, queued_after_ride_id,
  accepted_at, driver_arrived_at, started_at, completed_at, cancelled_at, cancelled_by
on public.rides
for each row
execute function private.enforce_ride_state_machine();
