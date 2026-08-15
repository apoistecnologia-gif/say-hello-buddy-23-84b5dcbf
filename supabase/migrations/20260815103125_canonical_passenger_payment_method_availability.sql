create or replace function public.is_passenger_ride_pix_enabled()
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_enabled jsonb;
  v_provider jsonb;
  v_provider_name text;
begin
  if auth.role() not in ('authenticated', 'service_role') then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select s.value into v_enabled
  from public.app_settings s
  where s.key = 'finance.ride_electronic_payments_enabled';

  select s.value into v_provider
  from public.app_settings s
  where s.key = 'finance.target_electronic_payment_provider';

  v_provider_name := nullif(lower(btrim(coalesce(v_provider #>> '{}', ''))), '');

  return coalesce(
    (v_enabled = 'true'::jsonb or lower(coalesce(v_enabled->>'enabled', 'false')) = 'true')
    and v_provider_name is not null
    and v_provider_name <> 'disabled',
    false
  );
end;
$function$;

revoke all on function public.is_passenger_ride_pix_enabled() from public, anon;
grant execute on function public.is_passenger_ride_pix_enabled() to authenticated, service_role;

drop function if exists public.get_passenger_payment_methods();

create function public.get_passenger_payment_methods()
returns table(
  id uuid,
  code text,
  name text,
  description text,
  icon text,
  requires_balance boolean,
  is_active boolean,
  sort_order integer,
  enabled boolean
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    pm.id,
    pm.code,
    pm.name,
    pm.description,
    pm.icon,
    pm.requires_balance,
    pm.is_active,
    pm.sort_order,
    case
      when pm.code = 'cash' then true
      when pm.code = 'pix' then public.is_passenger_ride_pix_enabled()
      else false
    end as enabled
  from public.payment_methods pm
  where pm.is_active = true
    and auth.role() in ('authenticated', 'service_role')
  order by pm.sort_order asc;
$function$;

revoke all on function public.get_passenger_payment_methods() from public, anon;
grant execute on function public.get_passenger_payment_methods() to authenticated, service_role;
