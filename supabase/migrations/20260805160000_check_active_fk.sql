-- Tentar ler o erro SQL de uma forma que nos diga o alvo da constraint REALMENTE
-- Se a mensagem diz "is not present in table users", então a FK ATIVA ainda aponta para users.
-- Isso sugere que o DROP TABLE não removeu a FK ou o schema cache do Postgres está retendo a definição antiga.

-- Tentar recriar users e user_roles do zero em uma única migração para forçar o reset.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

CREATE TABLE public.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    name text,
    email text,
    phone text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role public.app_role NOT NULL,
    UNIQUE (user_id, role)
);

GRANT ALL ON public.users TO service_role;
GRANT ALL ON public.user_roles TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.users TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.users FOR SELECT TO authenticated USING (auth.uid() = auth_user_id);
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (auth_user_id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'passenger');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
