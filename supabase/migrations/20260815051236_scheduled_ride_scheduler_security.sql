create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table if not exists private.internal_scheduler_secrets (
  name text primary key,
  token_hash text not null,
  rotated_at timestamptz not null default clock_timestamp()
);

revoke all on table private.internal_scheduler_secrets from public, anon, authenticated, service_role;

create or replace function public.validate_internal_scheduler_token(
  _name text,
  _token text
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from private.internal_scheduler_secrets s
    where s.name = _name
      and s.token_hash = encode(extensions.digest(convert_to(_token, 'UTF8'), 'sha256'), 'hex')
  );
$function$;

revoke all on function public.validate_internal_scheduler_token(text, text) from public, anon, authenticated;
grant execute on function public.validate_internal_scheduler_token(text, text) to service_role;
