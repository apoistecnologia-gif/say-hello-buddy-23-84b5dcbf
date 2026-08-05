-- Adicionar logs simples à trigger para debug via logs do Postgres (se acessível)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role public.app_role;
BEGIN
  RAISE LOG 'handle_new_user iniciado para user_id: %, email: %', NEW.id, NEW.email;
  
  v_role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'passenger');

  INSERT INTO public.users (auth_user_id, name, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email,
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (auth_user_id) DO UPDATE SET
    name = EXCLUDED.name,
    phone = EXCLUDED.phone;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  IF v_role = 'passenger' THEN
    INSERT INTO public.passenger_wallets (passenger_id, balance, currency)
    VALUES (NEW.id, 0.00, 'BRL')
    ON CONFLICT (passenger_id) DO NOTHING;
  END IF;

  RAISE LOG 'handle_new_user concluído com sucesso para user_id: %', NEW.id;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'ERRO em handle_new_user para user_id: % - Erro: %', NEW.id, SQLERRM;
  RETURN NEW; -- Permitir criação no Auth mesmo com erro na trigger (opcional, mas para debug é melhor)
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
