begin;

alter table public.users
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text,
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists privacy_version text,
  add column if not exists legal_acceptance_source text;

comment on column public.users.terms_accepted_at is
  'Data registrada pelo servidor em que o usuário aceitou os Termos de Uso.';
comment on column public.users.terms_version is
  'Versão dos Termos de Uso aceita pelo usuário.';
comment on column public.users.privacy_accepted_at is
  'Data registrada pelo servidor em que o usuário aceitou a Política de Privacidade.';
comment on column public.users.privacy_version is
  'Versão da Política de Privacidade aceita pelo usuário.';
comment on column public.users.legal_acceptance_source is
  'Fluxo que originou o registro do aceite legal.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  requested_role text := lower(coalesce(new.raw_user_meta_data ->> 'role', ''));
  mobility_id uuid;
  display_name text := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(new.email, ''), '@', 1),
    'Usuário'
  );
  accepted_terms boolean := lower(coalesce(new.raw_user_meta_data ->> 'terms_accepted', 'false')) = 'true';
  accepted_privacy boolean := lower(coalesce(new.raw_user_meta_data ->> 'privacy_accepted', 'false')) = 'true';
  accepted_terms_version text := nullif(btrim(new.raw_user_meta_data ->> 'terms_version'), '');
  accepted_privacy_version text := nullif(btrim(new.raw_user_meta_data ->> 'privacy_version'), '');
  acceptance_source text := nullif(btrim(new.raw_user_meta_data ->> 'legal_acceptance_source'), '');
begin
  if requested_role in ('passenger', 'driver') then
    insert into public.users (
      auth_user_id,
      name,
      email,
      phone,
      terms_accepted_at,
      terms_version,
      privacy_accepted_at,
      privacy_version,
      legal_acceptance_source
    ) values (
      new.id,
      display_name,
      new.email,
      nullif(regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone', ''), '\D', '', 'g'), ''),
      case when accepted_terms and accepted_terms_version is not null then now() end,
      case when accepted_terms then accepted_terms_version end,
      case when accepted_privacy and accepted_privacy_version is not null then now() end,
      case when accepted_privacy then accepted_privacy_version end,
      case when accepted_terms and accepted_privacy then acceptance_source end
    )
    on conflict (auth_user_id) do update
      set name = excluded.name,
          email = excluded.email,
          phone = coalesce(excluded.phone, public.users.phone),
          terms_accepted_at = coalesce(public.users.terms_accepted_at, excluded.terms_accepted_at),
          terms_version = coalesce(excluded.terms_version, public.users.terms_version),
          privacy_accepted_at = coalesce(public.users.privacy_accepted_at, excluded.privacy_accepted_at),
          privacy_version = coalesce(excluded.privacy_version, public.users.privacy_version),
          legal_acceptance_source = coalesce(excluded.legal_acceptance_source, public.users.legal_acceptance_source),
          updated_at = now()
    returning id into mobility_id;

    insert into public.user_roles (user_id, role)
    values (mobility_id, requested_role)
    on conflict (user_id, role) do nothing;

    if requested_role = 'passenger' then
      insert into public.passenger_wallets (passenger_id)
      values (mobility_id)
      on conflict (passenger_id) do nothing;

      insert into public.user_notification_preferences (user_id)
      values (mobility_id)
      on conflict (user_id) do nothing;
    end if;
  else
    insert into public.profiles (user_id, email, display_name, role)
    values (
      new.id,
      coalesce(new.email, ''),
      display_name,
      case
        when lower(coalesce(new.email, '')) = 'franciellopes22@gmail.com'
          then 'administrator'::public.app_role
        else 'reader'::public.app_role
      end
    )
    on conflict (user_id) do nothing;
  end if;

  return new;
exception
  when others then
    raise warning 'handle_new_user failed for auth user %: %', new.id, sqlerrm;
    return new;
end;
$function$;

commit;
