-- 1. Remover a trigger problemática
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2. Tentar recriar a tabela user_roles com a FK correta para auth.users(id)
-- Isso resolve o conflito de design onde o standalone espera auth.users(id) mas o schema atual usa public.users(id).
DROP TABLE IF EXISTS public.user_roles;

CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role public.app_role NOT NULL,
    UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Trigger simplificada que agora pode inserir NEW.id em user_roles sem depender de public.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Perfil
  INSERT INTO public.users (auth_user_id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email)
  ON CONFLICT (auth_user_id) DO NOTHING;
  
  -- Role (Agora aponta diretamente para NEW.id no auth.users)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'passenger'::public.app_role))
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
