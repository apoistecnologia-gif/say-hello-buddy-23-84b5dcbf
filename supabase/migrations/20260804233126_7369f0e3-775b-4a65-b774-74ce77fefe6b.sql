CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    new_user_id uuid;
    assigned_role public.app_role;
BEGIN
  -- Tentar extrair a role dos metadados, padrão 'passenger' para este app
  assigned_role := COALESCE(
    (new.raw_user_meta_data ->> 'role')::public.app_role, 
    'passenger'::public.app_role
  );

  INSERT INTO public.users (auth_user_id, name, phone, email)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 
    COALESCE(new.raw_user_meta_data ->> 'phone', ''),
    new.email
  )
  RETURNING id INTO new_user_id;
  
  -- Verificar se já existe a role para evitar erro de UNIQUE
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = new_user_id AND role = assigned_role) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (new_user_id, assigned_role);
  END IF;
  
  RETURN new;
END;
$$;