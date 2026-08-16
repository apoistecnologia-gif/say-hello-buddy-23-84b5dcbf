-- APOIS Corridas — harden main-account -> driver-subaccount credits.
-- Woovi's subaccount /credit endpoint does not expose a caller-provided
-- idempotency key. A network timeout after the provider accepted a credit is
-- therefore an ambiguous outcome and must never be replayed automatically.

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

  select c.* into v_credit
  from public.driver_provider_credits c
  join public.driver_payment_accounts a
    on a.id=c.payment_account_id
   and a.driver_id=c.driver_id
   and a.provider=c.provider
   and a.status='active'
  where c.provider = _provider
    and (
      c.status = 'pending'
      or (
        c.status = 'failed'
        and c.attempt_count < 5
        and coalesce(c.last_error,'') like 'safe_retry:%'
      )
    )
  order by c.created_at asc
  for update of c skip locked
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
  'Claims only new credits or explicitly safe retry failures. Processing/ambiguous Woovi credits are never replayed automatically.';
