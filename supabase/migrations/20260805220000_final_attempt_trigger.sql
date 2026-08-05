-- 1. DROP TUDO para garantir que não há conflitos
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- 2. Recriar estrutura garantindo o alvo da FK
-- O erro 500 diz "is not present in table users", o que confirma que o destino é 'users'.
-- Vamos garantir que 'users' use o auth_user_id correto.

CREATE TABLE IF NOT EXISTS public.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    name text,
    email text,
    phone text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    role public.app_role NOT NULL,
    UNIQUE (user_id, role)
);

-- 3. Função com tratamento de ordem de inserção
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_new_id UUID;
BEGIN
  -- 1. Inserir em users e obter o ID (PK)
  INSERT INTO public.users (auth_user_id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email)
  ON CONFLICT (auth_user_id) DO UPDATE SET email = EXCLUDED.email
  RETURNING id INTO v_new_id;
  
  -- 2. Inserir em user_roles usando o v_new_id obtido
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_new_id, 'passenger')
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Grants (ESSENCIAL PARA GRANT SELECT ON TABLE)
GRANT ALL ON public.users TO service_role;
GRANT ALL ON public.user_roles TO service_role;
GRANT ALL ON public.users TO authenticated;
GRANT ALL ON public.user_roles TO authenticated;
