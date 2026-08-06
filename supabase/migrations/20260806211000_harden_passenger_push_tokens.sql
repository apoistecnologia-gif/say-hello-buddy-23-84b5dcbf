-- APOIS Passageiro — consolida o contrato real dos tokens push.
-- Idempotente para bancos que receberam a baseline antiga antes do núcleo do passageiro.

begin;

alter table public.user_notification_tokens
  add column if not exists device_id text,
  add column if not exists permission_status text,
  add column if not exists updated_at timestamptz;

update public.user_notification_tokens
   set platform = lower(btrim(platform)),
       permission_status = coalesce(nullif(lower(btrim(permission_status)), ''), 'granted'),
       updated_at = coalesce(updated_at, last_used_at, created_at, now());

alter table public.user_notification_tokens
  alter column permission_status set default 'granted',
  alter column permission_status set not null,
  alter column is_active set default true,
  alter column updated_at set default now(),
  alter column updated_at set not null;

-- Mantém somente o registro mais recente de cada token antes de impor unicidade global.
with ranked_tokens as (
  select
    id,
    row_number() over (
      partition by token
      order by is_active desc, updated_at desc, created_at desc, id desc
    ) as position
  from public.user_notification_tokens
)
delete from public.user_notification_tokens target
using ranked_tokens ranked
where target.id = ranked.id
  and ranked.position > 1;

create unique index if not exists user_notification_tokens_token_key
  on public.user_notification_tokens(token);

create index if not exists user_notification_tokens_active_user_idx
  on public.user_notification_tokens(user_id)
  where is_active = true;

create index if not exists user_notification_tokens_device_idx
  on public.user_notification_tokens(platform, device_id)
  where device_id is not null;

do $constraints$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.user_notification_tokens'::regclass
       and conname = 'user_notification_tokens_platform_check'
  ) then
    alter table public.user_notification_tokens
      add constraint user_notification_tokens_platform_check
      check (platform in ('android', 'ios', 'web')) not valid;
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.user_notification_tokens'::regclass
       and conname = 'user_notification_tokens_permission_status_check'
  ) then
    alter table public.user_notification_tokens
      add constraint user_notification_tokens_permission_status_check
      check (permission_status in ('granted', 'provisional', 'denied')) not valid;
  end if;
end;
$constraints$;

create or replace function public.register_notification_token(
  _token text,
  _platform text,
  _device_id text default null,
  _permission_status text default 'granted'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  profile_id uuid;
  token_id uuid;
  clean_token text := btrim(coalesce(_token, ''));
  clean_platform text := lower(btrim(coalesce(_platform, '')));
  clean_device_id text := nullif(left(btrim(coalesce(_device_id, '')), 200), '');
  clean_permission text := lower(btrim(coalesce(_permission_status, 'granted')));
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if length(clean_token) < 20 or length(clean_token) > 4096 then
    raise exception 'invalid_notification_token' using errcode = '22023';
  end if;

  if clean_platform not in ('android', 'ios', 'web') then
    raise exception 'invalid_notification_platform' using errcode = '22023';
  end if;

  if clean_permission not in ('granted', 'provisional') then
    raise exception 'invalid_notification_permission' using errcode = '22023';
  end if;

  select profile.id
    into profile_id
    from public.users profile
   where (profile.auth_user_id = auth.uid() or profile.id = auth.uid())
     and profile.deleted_at is null
   order by (profile.auth_user_id = auth.uid()) desc
   limit 1;

  if profile_id is null then
    raise exception 'passenger_profile_missing' using errcode = 'P0002';
  end if;

  -- Um aparelho não deve continuar ativo para outra conta depois da troca de sessão.
  if clean_device_id is not null then
    update public.user_notification_tokens
       set is_active = false,
           updated_at = now()
     where platform = clean_platform
       and device_id = clean_device_id
       and token <> clean_token
       and is_active = true;
  end if;

  insert into public.user_notification_tokens (
    user_id,
    token,
    platform,
    device_id,
    permission_status,
    is_active,
    last_used_at,
    updated_at
  ) values (
    profile_id,
    clean_token,
    clean_platform,
    clean_device_id,
    clean_permission,
    true,
    now(),
    now()
  )
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        device_id = excluded.device_id,
        permission_status = excluded.permission_status,
        is_active = true,
        last_used_at = now(),
        updated_at = now()
  returning id into token_id;

  return token_id;
end;
$function$;

create or replace function public.deactivate_notification_token(_token text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  profile_id uuid;
  affected integer := 0;
  clean_token text := btrim(coalesce(_token, ''));
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if clean_token = '' then
    return false;
  end if;

  select profile.id
    into profile_id
    from public.users profile
   where (profile.auth_user_id = auth.uid() or profile.id = auth.uid())
     and profile.deleted_at is null
   order by (profile.auth_user_id = auth.uid()) desc
   limit 1;

  if profile_id is null then
    return false;
  end if;

  update public.user_notification_tokens
     set is_active = false,
         updated_at = now()
   where user_id = profile_id
     and token = clean_token
     and is_active = true;

  get diagnostics affected = row_count;
  return affected > 0;
end;
$function$;

-- Tokens são dados sensíveis: o aplicativo escreve somente pelas RPCs validadas.
revoke all on public.user_notification_tokens from anon;
revoke all on public.user_notification_tokens from authenticated;

revoke all on function public.register_notification_token(text, text, text, text) from public;
revoke all on function public.deactivate_notification_token(text) from public;
grant execute on function public.register_notification_token(text, text, text, text) to authenticated;
grant execute on function public.deactivate_notification_token(text) to authenticated;

commit;
