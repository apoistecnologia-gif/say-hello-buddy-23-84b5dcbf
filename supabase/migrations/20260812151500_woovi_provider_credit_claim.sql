create or replace function public.claim_driver_provider_credit(_provider text default 'woovi')
returns public.driver_provider_credits
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_credit public.driver_provider_credits%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;

  select * into v_credit
  from public.driver_provider_credits
  where provider = _provider
    and (
      status = 'pending'
      or (status = 'failed' and attempt_count < 5)
      or (status = 'processing' and updated_at < now() - interval '5 minutes')
    )
  order by created_at asc
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.driver_provider_credits
  set status = 'processing',
      attempt_count = attempt_count + 1,
      last_error = null,
      updated_at = now()
  where id = v_credit.id
  returning * into v_credit;

  return v_credit;
end;
$$;

revoke all on function public.claim_driver_provider_credit(text) from public, anon, authenticated;
grant execute on function public.claim_driver_provider_credit(text) to service_role;

comment on function public.claim_driver_provider_credit(text) is
  'Atomically leases one provider credit using FOR UPDATE SKIP LOCKED; stale leases can be reclaimed and retries are capped.';
