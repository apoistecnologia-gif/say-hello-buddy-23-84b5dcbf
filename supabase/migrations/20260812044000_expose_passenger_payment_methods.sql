create or replace function public.get_passenger_payment_methods()
returns table (
  id uuid,
  code text,
  name text,
  description text,
  icon text,
  requires_balance boolean,
  is_active boolean,
  sort_order integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pm.id,
    pm.code,
    pm.name,
    pm.description,
    pm.icon,
    pm.requires_balance,
    pm.is_active,
    pm.sort_order
  from public.payment_methods pm
  where pm.is_active = true
    and auth.role() in ('authenticated', 'service_role')
  order by pm.sort_order asc;
$$;

revoke all on function public.get_passenger_payment_methods() from public;
revoke all on function public.get_passenger_payment_methods() from anon;
grant execute on function public.get_passenger_payment_methods() to authenticated;
grant execute on function public.get_passenger_payment_methods() to service_role;
