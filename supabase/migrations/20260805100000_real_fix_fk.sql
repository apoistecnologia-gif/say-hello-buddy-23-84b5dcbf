-- 1. DROP trigger antiga
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2. Corrigir a função handle_new_user com a FK correta para user_roles
-- O erro 500 confirmou que user_roles(user_id) APONTA PARA public.users(id), NÃO PARA auth.users(id).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_new_public_user_id UUID;
  v_role public.app_role;
BEGIN
  -- Definir role padrão
  v_role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'passenger'::public.app_role);

  -- 1. Inserir na public.users primeiro para gerar o ID que user_roles precisa
  INSERT INTO public.users (auth_user_id, name, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email,
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (auth_user_id) DO UPDATE SET
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    updated_at = now()
  RETURNING id INTO v_new_public_user_id;

  -- 2. Inserir na public.user_roles (user_id é public.users.id)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_new_public_user_id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- 3. Inserir na public.passenger_wallets (passenger_id é public.users.id)
  IF v_role = 'passenger' THEN
    INSERT INTO public.passenger_wallets (passenger_id, balance, currency)
    VALUES (v_new_public_user_id, 0.00, 'BRL')
    ON CONFLICT (passenger_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Re-criar a trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
