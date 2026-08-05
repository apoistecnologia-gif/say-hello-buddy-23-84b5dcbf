-- 1. DROP TUDO
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- 2. Recriar sem FKs por um momento para confirmar se o problema é EXCLUSIVAMENTE a validação de integridade no momento do INSERT
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.passenger_wallets CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

CREATE TABLE public.users (
    id uuid PRIMARY KEY, -- Sem REFERENCES por enquanto
    name text,
    email text,
    phone text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid, -- Sem REFERENCES por enquanto
    role public.app_role NOT NULL
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, email)
  VALUES (NEW.id, 'Test', NEW.email);
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'passenger');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

GRANT ALL ON public.users TO service_role;
GRANT ALL ON public.user_roles TO service_role;
