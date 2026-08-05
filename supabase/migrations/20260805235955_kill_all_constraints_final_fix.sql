-- 1. DROP TUDO
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- 2. Recriar estrutura unificada onde 'users.id' É o UUID do Auth.
-- Isso elimina qualquer confusão de mapeamento.
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

-- 3. Função handle_new_user CORRIGIDA
-- Primeiro insere em users para satisfazer as FKs subsequentes na mesma transação.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- 1. Inserir em users (UUID do Auth = users.id)
  INSERT INTO public.users (id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email), NEW.email);
  
  -- 2. Inserir em user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'passenger');
  
  -- 3. Inserir em passenger_wallets
  INSERT INTO public.passenger_wallets (passenger_id)
  VALUES (NEW.id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Re-criar a trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Grants essenciais
GRANT ALL ON public.users TO service_role;
GRANT ALL ON public.user_roles TO service_role;
GRANT ALL ON public.passenger_wallets TO service_role;
GRANT ALL ON public.users TO authenticated;
GRANT ALL ON public.user_roles TO authenticated;
GRANT ALL ON public.passenger_wallets TO authenticated;
