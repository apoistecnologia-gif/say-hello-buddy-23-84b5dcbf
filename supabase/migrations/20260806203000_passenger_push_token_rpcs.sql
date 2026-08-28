begin;

create unique index if not exists user_notification_tokens_token_key
  on public.user_notification_tokens(token);

create or replace function public.register_notification_token(
  _token text,
  _platform text,
  _device_id text default null,
  _permission_status text default 'granted'
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth'
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

  select id
    into profile_id
  from public.users
  where auth_user_id = auth.uid()
    and deleted_at is null
  limit 1;

  if profile_id is null then
    raise exception 'passenger_profile_missing' using errcode = 'P0002';
  end if;

  if clean_device_id is not null then
    update public.user_notification_tokens
       set is_active = false,
           updated_at = now()
     where user_id = profile_id
       and platform = clean_platform
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
set search_path to 'public', 'auth'
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

  select id
    into profile_id
  from public.users
  where auth_user_id = auth.uid()
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

revoke all on function public.register_notification_token(text, text, text, text) from public;
revoke all on function public.deactivate_notification_token(text) from public;
grant execute on function public.register_notification_token(text, text, text, text) to authenticated;
grant execute on function public.deactivate_notification_token(text) to authenticated;

commit;
