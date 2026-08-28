create or replace function public.is_passenger_ride_pix_enabled()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_value jsonb;
begin
  if auth.role() not in ('authenticated', 'service_role') then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select s.value
    into v_value
  from public.app_settings s
  where s.key = 'finance.ride_electronic_payments_enabled';

  return coalesce(
    v_value = 'true'::jsonb
    or lower(coalesce(v_value->>'enabled', 'false')) = 'true',
    false
  );
end;
$$;

revoke all on function public.is_passenger_ride_pix_enabled() from public, anon;
grant execute on function public.is_passenger_ride_pix_enabled() to authenticated, service_role;

comment on function public.is_passenger_ride_pix_enabled() is
  'Authenticated read-only capability gate for passenger Pix rides. Keeps app_settings backend-owned.';
