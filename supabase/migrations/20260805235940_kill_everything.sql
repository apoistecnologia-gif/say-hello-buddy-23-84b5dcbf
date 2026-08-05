-- Tentar deletar as tabelas pelo nome do OID se possível, mas como não temos psql, 
-- vamos tentar renomear para sair do caminho de qualquer cache.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
ALTER TABLE IF EXISTS public.user_roles RENAME TO user_roles_old_ghost;
ALTER TABLE IF EXISTS public.users RENAME TO users_old_ghost;

-- Criar com nomes NOVOS para desviar de qualquer constraint zumbi
CREATE TABLE public.app_profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id),
    name text,
    email text
);

CREATE TABLE public.app_user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.app_profiles(id),
    role public.app_role NOT NULL
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.app_profiles (id, name, email) VALUES (NEW.id, 'Ghost Test', NEW.email);
  INSERT INTO public.app_user_roles (user_id, role) VALUES (NEW.id, 'passenger');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

GRANT ALL ON public.app_profiles TO service_role;
GRANT ALL ON public.app_user_roles TO service_role;
