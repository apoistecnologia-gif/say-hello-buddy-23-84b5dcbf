-- Impede escalada de privilégio por operações administrativas genéricas.
-- Alterações de admin/super_admin só podem ser feitas por um usuário autenticado
-- que já possua super_admin. Chamadas com service role sem identidade de usuário
-- ficam bloqueadas para papéis privilegiados.

create or replace function public.protect_privileged_admin_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  actor_is_super_admin boolean := false;
  affected_role text;
begin
  affected_role := case
    when tg_op = 'DELETE' then old.role::text
    else new.role::text
  end;

  if affected_role not in ('admin', 'super_admin') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if actor is not null then
    select exists (
      select 1
      from public.user_roles ur
      where ur.user_id = actor
        and ur.role::text = 'super_admin'
    ) into actor_is_super_admin;
  end if;

  if not actor_is_super_admin then
    raise exception 'super_admin_required'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE'
     and old.user_id = actor
     and old.role::text = 'super_admin' then
    raise exception 'cannot_revoke_self_super_admin'
      using errcode = '42501';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists protect_privileged_admin_roles_trigger
  on public.user_roles;

create trigger protect_privileged_admin_roles_trigger
before insert or update or delete on public.user_roles
for each row
execute function public.protect_privileged_admin_roles();

revoke all on function public.protect_privileged_admin_roles() from public;
