-- Fundação segura do APOIS Passageiro no mesmo Supabase do site.
-- Não altera as tabelas institucionais, conteúdos ou permissões existentes.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text,
  email text,
  phone text,
  avatar_url text,
  city text,
  cpf text,
  birth_date date,
  gender text,
  average_rating numeric(3,2),
  total_ratings integer not null default 0 check (total_ratings >= 0),
  completed_rides integer not null default 0 check (completed_rides >= 0),
  preferences jsonb not null default '{}'::jsonb,
  blocked_at timestamptz,
  block_reason text,
  suspended_at timestamptz,
  suspended_until timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists users_email_unique_active
  on public.users (lower(email))
  where email is not null and deleted_at is null;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('passenger', 'driver', 'admin', 'support', 'operations', 'financial')),
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create table if not exists public.passenger_wallets (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null unique references public.users(id) on delete cascade,
  balance numeric(12,2) not null default 0 check (balance >= 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  is_blocked boolean not null default false,
  blocked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_notification_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  ride_updates boolean not null default true,
  promotions boolean not null default false,
  safety_alerts boolean not null default true,
  payment_updates boolean not null default true,
  accessibility_large_text boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.passenger_emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references public.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  phone text not null check (char_length(regexp_replace(phone, '\D', '', 'g')) between 10 and 15),
  relationship text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists passenger_one_primary_emergency_contact
  on public.passenger_emergency_contacts (passenger_id)
  where is_primary;

create or replace function public.mobility_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id
  from public.users u
  where u.auth_user_id = auth.uid()
    and u.deleted_at is null
  limit 1;
$$;

revoke all on function public.mobility_user_id() from public;
grant execute on function public.mobility_user_id() to authenticated;

alter table public.users enable row level security;
alter table public.user_roles enable row level security;
alter table public.passenger_wallets enable row level security;
alter table public.user_notification_preferences enable row level security;
alter table public.passenger_emergency_contacts enable row level security;

drop policy if exists users_read_own on public.users;
create policy users_read_own on public.users
for select to authenticated
using (auth_user_id = auth.uid());

drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users
for update to authenticated
using (auth_user_id = auth.uid())
with check (auth_user_id = auth.uid());

drop policy if exists user_roles_read_own on public.user_roles;
create policy user_roles_read_own on public.user_roles
for select to authenticated
using (user_id = public.mobility_user_id());

drop policy if exists passenger_wallet_read_own on public.passenger_wallets;
create policy passenger_wallet_read_own on public.passenger_wallets
for select to authenticated
using (passenger_id = public.mobility_user_id());

drop policy if exists notification_preferences_manage_own on public.user_notification_preferences;
create policy notification_preferences_manage_own on public.user_notification_preferences
for all to authenticated
using (user_id = public.mobility_user_id())
with check (user_id = public.mobility_user_id());

drop policy if exists emergency_contacts_manage_own on public.passenger_emergency_contacts;
create policy emergency_contacts_manage_own on public.passenger_emergency_contacts
for all to authenticated
using (passenger_id = public.mobility_user_id())
with check (passenger_id = public.mobility_user_id());

-- Mantém o cadastro institucional do site e cria a identidade de mobilidade
-- apenas quando o aplicativo envia role=passenger ou role=driver.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  requested_role text := lower(coalesce(new.raw_user_meta_data ->> 'role', ''));
  mobility_id uuid;
  display_name text := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(new.email, ''), '@', 1),
    'Usuário'
  );
begin
  if requested_role in ('passenger', 'driver') then
    insert into public.users (
      auth_user_id,
      name,
      email,
      phone
    ) values (
      new.id,
      display_name,
      new.email,
      nullif(regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone', ''), '\D', '', 'g'), '')
    )
    on conflict (auth_user_id) do update
      set name = excluded.name,
          email = excluded.email,
          phone = coalesce(excluded.phone, public.users.phone),
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
$$;

-- Reinstala somente a trigger oficial, sem remover triggers de outros sistemas.
drop trigger if exists auth_user_profile on auth.users;
create trigger auth_user_profile
after insert on auth.users
for each row execute function public.handle_new_user();

grant select, update on public.users to authenticated;
grant select on public.user_roles to authenticated;
grant select on public.passenger_wallets to authenticated;
grant select, insert, update, delete on public.user_notification_preferences to authenticated;
grant select, insert, update, delete on public.passenger_emergency_contacts to authenticated;
