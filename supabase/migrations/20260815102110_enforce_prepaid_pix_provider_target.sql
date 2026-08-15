create or replace function private.enforce_prepaid_pix_provider_target()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_target text;
begin
  if lower(coalesce(new.payment_method,'')) <> 'pix' then
    return new;
  end if;

  select nullif(lower(btrim(coalesce(s.value #>> '{}',''))), '')
    into v_target
  from public.app_settings s
  where s.key = 'finance.target_electronic_payment_provider'
  limit 1;

  if v_target is null or v_target = 'disabled' then
    raise exception 'electronic_payment_provider_not_configured' using errcode='55000';
  end if;

  if nullif(lower(btrim(coalesce(new.payment_provider,''))), '') is distinct from v_target then
    raise exception 'electronic_payment_provider_mismatch' using errcode='23514';
  end if;

  return new;
end;
$function$;

revoke all on function private.enforce_prepaid_pix_provider_target() from public, anon, authenticated;
grant execute on function private.enforce_prepaid_pix_provider_target() to service_role;

drop trigger if exists trg_enforce_prepaid_pix_provider_target on public.rides;
create trigger trg_enforce_prepaid_pix_provider_target
before insert or update of payment_method, payment_provider on public.rides
for each row execute function private.enforce_prepaid_pix_provider_target();
