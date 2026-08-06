-- Corrige public.handle_new_user() para o schema real (users.id != auth.users.id)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _public_user_id uuid;
  _role_text text;
  _role public.app_role;
  _name text;
  _phone text;
BEGIN
  _name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NEW.email
  );
  _phone := NEW.raw_user_meta_data->>'phone';

  _role_text := lower(COALESCE(NEW.raw_user_meta_data->>'role', 'passenger'));
  IF _role_text NOT IN (
    SELECT unnest(enum_range(NULL::public.app_role))::text
  ) OR _role_text NOT IN ('passenger', 'driver') THEN
    _role_text := 'passenger';
  END IF;
  _role := _role_text::public.app_role;

  INSERT INTO public.users (auth_user_id, name, email, phone)
  VALUES (NEW.id, _name, NEW.email, _phone)
  ON CONFLICT (auth_user_id) DO UPDATE
    SET name  = COALESCE(EXCLUDED.name, public.users.name),
        email = COALESCE(EXCLUDED.email, public.users.email),
        phone = COALESCE(EXCLUDED.phone, public.users.phone),
        updated_at = now()
  RETURNING id INTO _public_user_id;

  IF _public_user_id IS NULL THEN
    SELECT id INTO _public_user_id
    FROM public.users
    WHERE auth_user_id = NEW.id;
  END IF;

  IF _public_user_id IS NULL THEN
    RAISE EXCEPTION 'handle_new_user: public.users row not resolved for auth user %', NEW.id;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_public_user_id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  IF _role = 'passenger'::public.app_role THEN
    INSERT INTO public.passenger_wallets (passenger_id)
    VALUES (_public_user_id)
    ON CONFLICT (passenger_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Validação de sanidade (sem criar usuários reais)
DO $sanity$
DECLARE
  _cnt int;
BEGIN
  SELECT count(*) INTO _cnt
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'handle_new_user'
    AND p.prosecdef
    AND 'search_path=public' = ANY(COALESCE(p.proconfig, ARRAY[]::text[]));
  IF _cnt <> 1 THEN
    RAISE EXCEPTION 'sanity: handle_new_user must be SECURITY DEFINER with search_path=public';
  END IF;

  SELECT count(*) INTO _cnt
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'auth' AND c.relname = 'users'
    AND t.tgname = 'on_auth_user_created' AND NOT t.tgisinternal;
  IF _cnt <> 1 THEN
    RAISE EXCEPTION 'sanity: trigger on_auth_user_created missing';
  END IF;

  -- a função nunca pode inserir em users.id diretamente
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'handle_new_user'
      AND p.prosrc ~* 'INSERT INTO public\.users \(id'
  ) THEN
    RAISE EXCEPTION 'sanity: handle_new_user must not write users.id directly';
  END IF;

  -- órfãos não podem existir após a correção
  SELECT count(*) INTO _cnt FROM public.user_roles ur
  LEFT JOIN public.users u ON u.id = ur.user_id WHERE u.id IS NULL;
  IF _cnt > 0 THEN
    RAISE EXCEPTION 'sanity: % orphan user_roles rows', _cnt;
  END IF;

  SELECT count(*) INTO _cnt FROM public.passenger_wallets w
  LEFT JOIN public.users u ON u.id = w.passenger_id WHERE u.id IS NULL;
  IF _cnt > 0 THEN
    RAISE EXCEPTION 'sanity: % orphan passenger_wallets rows', _cnt;
  END IF;
END
$sanity$;