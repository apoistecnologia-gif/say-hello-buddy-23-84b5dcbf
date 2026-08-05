CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_check UUID;
BEGIN
  -- 1. Inserir em users
  INSERT INTO public.users (auth_user_id, name, email)
  VALUES (NEW.id, 'Check Order', NEW.email);
  
  -- 2. Verificar se o registro existe no mesmo contexto
  SELECT id INTO v_check FROM public.users WHERE auth_user_id = NEW.id;
  
  -- 3. Inserir em user_roles usando o ID retornado
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_check, 'passenger');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
