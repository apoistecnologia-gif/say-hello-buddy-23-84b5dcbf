-- Keep Guincho and Fretes/Mudancas implemented, but disabled by a server-side gate.
-- The two clients share this Supabase project, so this migration is mirrored in
-- both source repositories and is intentionally idempotent.

begin;

insert into public.app_settings (key, value, description, updated_at)
values
  (
    'feature_guincho_enabled',
    'false'::jsonb,
    'Libera Guincho no cliente, cadastro e operacao de parceiros.',
    now()
  ),
  (
    'feature_fretes_enabled',
    'false'::jsonb,
    'Libera Fretes e Mudancas no cliente, cadastro e operacao de parceiros.',
    now()
  )
on conflict (key) do update
set value = excluded.value,
    description = excluded.description,
    updated_at = now();

create or replace function public.ride_feature_enabled(_category text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select case lower(btrim(coalesce(_category, '')))
    when 'guincho' then coalesce((
      select lower(coalesce(s.value #>> '{}', 'false')) in ('true', '1', 'yes', 'on')
      from public.app_settings s
      where s.key = 'feature_guincho_enabled'
      limit 1
    ), false)
    when 'fretes' then coalesce((
      select lower(coalesce(s.value #>> '{}', 'false')) in ('true', '1', 'yes', 'on')
      from public.app_settings s
      where s.key = 'feature_fretes_enabled'
      limit 1
    ), false)
    else true
  end;
$function$;

create or replace function public.get_ride_feature_flags()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'feature_guincho_enabled', public.ride_feature_enabled('guincho'),
    'feature_fretes_enabled', public.ride_feature_enabled('fretes')
  );
$function$;

revoke all on function public.ride_feature_enabled(text) from public, anon, authenticated;
grant execute on function public.ride_feature_enabled(text) to service_role;

revoke all on function public.get_ride_feature_flags() from public;
grant execute on function public.get_ride_feature_flags() to anon, authenticated, service_role;

create or replace function public.enforce_ride_feature_flags()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if public.ride_feature_enabled(new.category) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'feature_%_unavailable', lower(new.category)
      using errcode = 'P0001',
            hint = 'Esta categoria esta temporariamente indisponivel.';
  end if;

  if new.category is distinct from old.category
     or (
       new.status is distinct from old.status
       and old.status in ('agendada', 'procurar_motorista')
       and new.status in ('procurar_motorista', 'motorista_a_caminho', 'motorista_chegou', 'em_viagem')
     ) then
    raise exception 'feature_%_unavailable', lower(new.category)
      using errcode = 'P0001',
            hint = 'Esta categoria esta temporariamente indisponivel.';
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_ride_feature_flags() from public, anon, authenticated, service_role;

drop trigger if exists trg_enforce_ride_feature_flags on public.rides;
create trigger trg_enforce_ride_feature_flags
before insert or update of category, status on public.rides
for each row execute function public.enforce_ride_feature_flags();

create or replace function public.enforce_driver_feature_flags()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_has_active_ride boolean := false;
begin
  if public.ride_feature_enabled(new.category) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'feature_%_unavailable', lower(new.category)
      using errcode = 'P0001',
            hint = 'Novos cadastros para esta categoria estao temporariamente indisponiveis.';
  end if;

  if new.category is distinct from old.category then
    raise exception 'feature_%_unavailable', lower(new.category)
      using errcode = 'P0001',
            hint = 'Novos cadastros para esta categoria estao temporariamente indisponiveis.';
  end if;

  if coalesce(new.is_online, false) then
    select exists (
      select 1
      from public.rides r
      where r.driver_id = new.id
        and r.status in ('motorista_a_caminho', 'motorista_chegou', 'em_viagem')
    ) into v_has_active_ride;

    if not v_has_active_ride then
      raise exception 'feature_%_unavailable', lower(new.category)
        using errcode = 'P0001',
              hint = 'A operacao desta categoria esta temporariamente indisponivel.';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_driver_feature_flags() from public, anon, authenticated, service_role;

drop trigger if exists trg_enforce_driver_feature_flags on public.drivers;
create trigger trg_enforce_driver_feature_flags
before insert or update of category, is_online on public.drivers
for each row execute function public.enforce_driver_feature_flags();

create or replace function public.finish_disabled_driver_operation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.driver_id is not null
     and old.status in ('motorista_a_caminho', 'motorista_chegou', 'em_viagem')
     and new.status in ('finalizada', 'cancelada_passageiro', 'cancelada_motorista', 'expired') then
    update public.drivers d
    set is_online = false,
        updated_at = now()
    where d.id = new.driver_id
      and not public.ride_feature_enabled(d.category);
  end if;

  return new;
end;
$function$;

revoke all on function public.finish_disabled_driver_operation() from public, anon, authenticated, service_role;

drop trigger if exists trg_finish_disabled_driver_operation on public.rides;
create trigger trg_finish_disabled_driver_operation
after update of status on public.rides
for each row execute function public.finish_disabled_driver_operation();

update public.drivers d
set is_online = false,
    updated_at = now()
where d.is_online
  and not public.ride_feature_enabled(d.category)
  and not exists (
    select 1
    from public.rides r
    where r.driver_id = d.id
      and r.status in ('motorista_a_caminho', 'motorista_chegou', 'em_viagem')
  );

comment on function public.get_ride_feature_flags() is
  'Read-only public capability surface for Guincho and Fretes/Mudancas feature flags.';

commit;
