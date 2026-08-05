-- 1. DROP TUDO para garantir limpeza
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- 2. Recriar estrutura garantindo o vínculo direto com auth.users(id) para evitar desvio de transação
-- Se o erro diz "Key (user_id)=(...) is not present in table users", 
-- e o UUID (...) é o do AUTH, então o banco acha que user_roles(user_id) APONTA PARA users(id), 
-- onde users(id) é a PK (gerada pelo Postgres) e NÃO o auth_user_id.

-- SOLUÇÃO: Fazer com que public.users use o mesmo UUID do Auth como sua PRIMARY KEY.
-- Isso elimina o desvio entre ID e AUTH_USER_ID.

DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.passenger_wallets CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

CREATE TABLE public.users (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name text,
    email text,
    phone text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    role public.app_role NOT NULL,
    UNIQUE (user_id, role)
);

CREATE TABLE public.passenger_wallets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    passenger_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    balance decimal(12,2) DEFAULT 0.00,
    currency text DEFAULT 'BRL',
    UNIQUE (passenger_id)
);

-- 3. Função com ID Unificado (NEW.id em todas as tabelas)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- 1. Inserir em users usando o mesmo UUID do Auth
  INSERT INTO public.users (id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  
  -- 2. Inserir em user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'passenger')
  ON CONFLICT (user_id, role) DO NOTHING;
  
  -- 3. Inserir em passenger_wallets
  INSERT INTO public.passenger_wallets (passenger_id)
  VALUES (NEW.id)
  ON CONFLICT (passenger_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Grants
GRANT ALL ON public.users TO service_role;
GRANT ALL ON public.user_roles TO service_role;
GRANT ALL ON public.passenger_wallets TO service_role;
GRANT SELECT ON public.users TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT ON public.passenger_wallets TO authenticated;

-- Ativar RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passenger_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.users FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can view own wallet" ON public.passenger_wallets FOR SELECT TO authenticated USING (auth.uid() = passenger_id);
