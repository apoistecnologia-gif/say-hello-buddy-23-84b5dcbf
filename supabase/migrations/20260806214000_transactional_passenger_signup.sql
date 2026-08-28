-- APOIS Passageiro — cadastro transacional entre Auth e identidade operacional.
-- Nenhum erro é silenciado: se perfil, função, carteira ou preferências falharem,
-- a inserção em auth.users também será revertida.

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  requested_role text := lower(btrim(coalesce(new.raw_user_meta_data ->> 'role', '')));
  mobility_id uuid;
  display_name text := left(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Usuário'
  ), 160);
  normalized_phone text := nullif(
    left(regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone', ''), '[^0-9]', '', 'g'), 15),
    ''
  );
  accepted_terms boolean := lower(coalesce(new.raw_user_meta_data ->> 'terms_accepted', 'false')) = 'true';
  accepted_privacy boolean := lower(coalesce(new.raw_user_meta_data ->> 'privacy_accepted', 'false')) = 'true';
  accepted_terms_version text := nullif(left(btrim(new.raw_user_meta_data ->> 'terms_version'), 40), '');
  accepted_privacy_version text := nullif(left(btrim(new.raw_user_meta_data ->> 'privacy_version'), 40), '');
  acceptance_source text := nullif(left(btrim(new.raw_user_meta_data ->> 'legal_acceptance_source'), 80), '');
begin
  if requested_role in ('passenger', 'driver') then
    if requested_role = 'passenger' and (
      not accepted_terms
      or not accepted_privacy
      or accepted_terms_version is null
      or accepted_privacy_version is null
      or acceptance_source is distinct from 'passenger_signup'
    ) then
      raise exception 'passenger_legal_acceptance_required' using errcode = '22023';
    end if;

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
      nullif(lower(btrim(coalesce(new.email, ''))), ''),
      normalized_phone,
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
          legal_acceptance_source = coalesce(
            excluded.legal_acceptance_source,
            public.users.legal_acceptance_source
          ),
          deleted_at = null,
          updated_at = now()
    returning id into mobility_id;

    if mobility_id is null then
      raise exception 'mobility_profile_not_created' using errcode = 'P0001';
    end if;

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
      coalesce(lower(btrim(new.email)), ''),
      display_name,
      case
        when lower(coalesce(new.email, '')) = 'franciellopes22@gmail.com'
          then 'administrator'::public.app_role
        else 'reader'::public.app_role
      end
    )
    on conflict (user_id) do update
      set email = excluded.email,
          display_name = excluded.display_name;
  end if;

  return new;
end;
$function$;

comment on function public.handle_new_user() is
  'Cria identidade institucional ou operacional de forma atômica após inserção em auth.users.';

commit;
