
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP TABLE IF EXISTS public.passengers;

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user', 'passenger', 'driver');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    name text,
    phone text,
    email text,
    avatar_url text,
    city text,
    average_rating numeric(3,2) DEFAULT 0,
    total_ratings integer DEFAULT 0,
    completed_rides integer DEFAULT 0,
    block_reason text,
    last_login_at timestamptz,
    suspended_at timestamptz,
    blocked_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    role public.app_role NOT NULL,
    UNIQUE (user_id, role)
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    new_user_id uuid;
BEGIN
  INSERT INTO public.users (auth_user_id, name, phone, email)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data ->> 'name', ''), 
    COALESCE(new.raw_user_meta_data ->> 'phone', ''),
    new.email
  )
  RETURNING id INTO new_user_id;
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    new_user_id,
    COALESCE((new.raw_user_meta_data ->> 'role')::public.app_role, 'user'::public.app_role)
  );
  
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

GRANT SELECT, INSERT, UPDATE ON public.users TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.users TO service_role;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.users FOR SELECT TO authenticated USING (auth.uid() = auth_user_id);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE TO authenticated USING (auth.uid() = auth_user_id);
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid()));
