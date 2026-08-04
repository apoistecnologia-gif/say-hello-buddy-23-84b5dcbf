
CREATE TABLE public.passengers (
    id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name text NOT NULL,
    phone text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    PRIMARY KEY (id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.passengers TO authenticated;
GRANT ALL ON public.passengers TO service_role;

ALTER TABLE public.passengers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Passengers can view their own profile" 
ON public.passengers FOR SELECT 
TO authenticated 
USING (auth.uid() = id);

CREATE POLICY "Passengers can update their own profile" 
ON public.passengers FOR UPDATE 
TO authenticated 
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.passengers (id, full_name, phone)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data ->> 'full_name', ''), 
    COALESCE(new.raw_user_meta_data ->> 'phone', '')
  );
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
