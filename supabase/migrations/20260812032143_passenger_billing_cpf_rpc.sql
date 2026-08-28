create or replace function public.set_passenger_billing_cpf(_cpf text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_cpf text;
  v_current text;
  v_sum integer;
  v_digit1 integer;
  v_digit2 integer;
  i integer;
begin
  if auth.role() <> 'authenticated' or auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  v_cpf := regexp_replace(coalesce(_cpf, ''), '[^0-9]', '', 'g');
  if length(v_cpf) <> 11 or v_cpf ~ '^([0-9])\1{10}$' then
    raise exception 'invalid_cpf' using errcode = '22023';
  end if;

  v_sum := 0;
  for i in 1..9 loop
    v_sum := v_sum + substr(v_cpf, i, 1)::integer * (11 - i);
  end loop;
  v_digit1 := (v_sum * 10) % 11;
  if v_digit1 = 10 then v_digit1 := 0; end if;
  if v_digit1 <> substr(v_cpf, 10, 1)::integer then
    raise exception 'invalid_cpf' using errcode = '22023';
  end if;

  v_sum := 0;
  for i in 1..10 loop
    v_sum := v_sum + substr(v_cpf, i, 1)::integer * (12 - i);
  end loop;
  v_digit2 := (v_sum * 10) % 11;
  if v_digit2 = 10 then v_digit2 := 0; end if;
  if v_digit2 <> substr(v_cpf, 11, 1)::integer then
    raise exception 'invalid_cpf' using errcode = '22023';
  end if;

  select u.id, regexp_replace(coalesce(u.cpf, ''), '[^0-9]', '', 'g')
    into v_user_id, v_current
  from public.users u
  where u.auth_user_id = auth.uid()
    and u.deleted_at is null
  for update;

  if v_user_id is null then
    raise exception 'passenger_profile_missing' using errcode = 'P0002';
  end if;

  if v_current <> '' and v_current <> v_cpf then
    raise exception 'cpf_change_requires_support' using errcode = '42501';
  end if;

  update public.users
  set cpf = v_cpf,
      updated_at = now()
  where id = v_user_id;

  return jsonb_build_object('ok', true, 'cpf_last4', right(v_cpf, 4));
end;
$$;

revoke all on function public.set_passenger_billing_cpf(text) from public, anon;
grant execute on function public.set_passenger_billing_cpf(text) to authenticated;
