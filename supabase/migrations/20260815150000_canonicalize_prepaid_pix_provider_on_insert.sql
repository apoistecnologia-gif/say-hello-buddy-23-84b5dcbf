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

  -- The database is the canonical source of provider identity for new PIX rides.
  -- This keeps callers provider-neutral while preserving the provider recorded on
  -- existing rides across future cutovers.
  if tg_op = 'INSERT' then
    new.payment_provider := v_target;
    return new;
  end if;

  if nullif(lower(btrim(coalesce(new.payment_provider,''))), '') is distinct from v_target then
    raise exception 'electronic_payment_provider_mismatch' using errcode='23514';
  end if;

  return new;
end;
$function$;
