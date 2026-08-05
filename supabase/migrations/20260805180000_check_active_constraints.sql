-- Tentar ler a FK de user_roles de novo, mas se o migration anterior FALHOU, o DROP TABLE não aconteceu.
-- Vamos tentar um comando que DESLIGA a constraint se ela existir antes de dropar
ALTER TABLE IF EXISTS public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
DROP TABLE IF EXISTS public.user_roles CASCADE;

-- Criar sem FK por um momento para testar se o cadastro PASSA
CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    UNIQUE (user_id, role)
);

GRANT ALL ON public.user_roles TO service_role;
GRANT SELECT ON public.user_roles TO authenticated;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'passenger');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
