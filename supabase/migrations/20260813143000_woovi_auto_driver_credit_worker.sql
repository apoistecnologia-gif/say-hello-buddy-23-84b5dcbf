-- Secure automatic invocation of the Woovi driver-credit worker.
-- The trigger calls a small internal bridge using a random Vault token.
-- The bridge verifies that token server-side and then invokes the existing
-- service-role-protected driver-woovi-credit worker. No service-role secret is
-- stored in a table, migration, trigger definition or frontend.

insert into public.app_settings(key,value,description)
values (
  'finance.driver_provider_credit_worker_url',
  'null'::jsonb,
  'Environment-specific internal bridge URL for pending Woovi driver credits.'
)
on conflict (key) do nothing;

do $$
begin
  if not exists (select 1 from vault.secrets where name='woovi_driver_credit_worker_token') then
    perform vault.create_secret(
      encode(gen_random_bytes(32),'hex'),
      'woovi_driver_credit_worker_token',
      'Internal trigger token for automatic Woovi driver-credit processing.'
    );
  end if;
end;
$$;

create or replace function public.verify_driver_credit_worker_token(_token text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_expected text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;

  select decrypted_secret into v_expected
  from vault.decrypted_secrets
  where name='woovi_driver_credit_worker_token'
  order by created_at desc
  limit 1;

  return v_expected is not null
    and _token is not null
    and length(v_expected)=length(_token)
    and v_expected=_token;
end;
$$;

revoke all on function public.verify_driver_credit_worker_token(text) from public, anon, authenticated;
grant execute on function public.verify_driver_credit_worker_token(text) to service_role;

create or replace function public.enqueue_woovi_driver_credit_worker()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_url text;
  v_token text;
begin
  if new.provider <> 'woovi' or new.status <> 'pending' then return new; end if;
  if tg_op='UPDATE' and old.status is not distinct from new.status then return new; end if;

  select nullif(btrim(value #>> '{}'),'') into v_url
  from public.app_settings
  where key='finance.driver_provider_credit_worker_url';
  if v_url is null then return new; end if;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name='woovi_driver_credit_worker_token'
  order by created_at desc
  limit 1;
  if v_token is null then raise exception 'woovi_driver_credit_worker_token_missing'; end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'content-type','application/json',
      'x-apois-worker-token',v_token
    ),
    body := jsonb_build_object(
      'creditId',new.id,
      'rideId',new.ride_id,
      'driverId',new.driver_id
    ),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

revoke all on function public.enqueue_woovi_driver_credit_worker() from public, anon, authenticated;

drop trigger if exists trg_enqueue_woovi_driver_credit_worker on public.driver_provider_credits;
create trigger trg_enqueue_woovi_driver_credit_worker
after insert or update of status on public.driver_provider_credits
for each row execute function public.enqueue_woovi_driver_credit_worker();