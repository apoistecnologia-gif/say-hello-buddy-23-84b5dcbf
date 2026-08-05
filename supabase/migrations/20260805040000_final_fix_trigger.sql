-- 1. DROP trigger antiga
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2. Corrigir a função handle_new_user de acordo com a estrutura REAL das tabelas:
-- public.users (id, auth_user_id, name, email, phone) -> auth_user_id REFERENCES auth.users(id)
-- public.user_roles (id, user_id, role) -> user_id REFERENCES public.users(id)
-- public.passenger_wallets (id, passenger_id, balance) -> passenger_id REFERENCES public.users(id)

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_new_public_user_id UUID;
  v_role public.app_role;
BEGIN
  -- Log para diagnóstico (visível no log do Postgres do Supabase)
  RAISE LOG 'handle_new_user: processando novo auth.user_id=%', NEW.id;

  -- Definir role padrão
  v_role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'passenger'::public.app_role);

  -- 1. Inserir ou atualizar na public.users (tabela de perfis)
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

  -- 2. Inserir na public.user_roles (user_id aponta para public.users.id)
  -- Importante: O standalone usa REFERENCES auth.users(id), mas a migração 20260804003520 usa REFERENCES public.users(id).
  -- A migração que criamos (ou corrigimos) deve respeitar a constraint REAL.
  -- Se houver falha aqui, o erro 'Database error saving new user' aparecerá no Auth.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_new_public_user_id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- 3. Inserir na public.passenger_wallets (passenger_id aponta para public.users.id)
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

-- 4. Garantir privilégios
GRANT ALL ON public.users TO service_role;
GRANT ALL ON public.user_roles TO service_role;
GRANT ALL ON public.passenger_wallets TO service_role;
