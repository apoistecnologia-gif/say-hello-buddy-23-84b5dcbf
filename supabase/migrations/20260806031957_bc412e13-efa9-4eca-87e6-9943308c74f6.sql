-- ============ TABELAS (aditivas e idempotentes) ============

CREATE TABLE IF NOT EXISTS public.user_notification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL DEFAULT 'android',
  device_id text,
  permission_status text NOT NULL DEFAULT 'granted',
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ride_updates boolean NOT NULL DEFAULT true,
  ride_requests boolean NOT NULL DEFAULT true,
  promotions boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event text NOT NULL,
  channel text NOT NULL DEFAULT 'fcm',
  title text,
  body text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'sent',
  error text,
  ride_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ CONSTRAINTS ============
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_notification_tokens_platform_chk') THEN
    ALTER TABLE public.user_notification_tokens
      ADD CONSTRAINT user_notification_tokens_platform_chk
      CHECK (platform IN ('android','ios','web'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_notification_tokens_permission_chk') THEN
    ALTER TABLE public.user_notification_tokens
      ADD CONSTRAINT user_notification_tokens_permission_chk
      CHECK (permission_status IN ('granted','denied','provisional','unknown'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_notification_tokens_token_key') THEN
    ALTER TABLE public.user_notification_tokens
      ADD CONSTRAINT user_notification_tokens_token_key UNIQUE (token);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_logs_status_chk') THEN
    ALTER TABLE public.notification_logs
      ADD CONSTRAINT notification_logs_status_chk
      CHECK (status IN ('sent','failed','partial','suppressed'));
  END IF;
END $$;

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_unt_user_active
  ON public.user_notification_tokens(user_id) WHERE is_active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_unt_user_device
  ON public.user_notification_tokens(user_id, device_id, platform)
  WHERE device_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notification_logs_user_created
  ON public.notification_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_logs_ride
  ON public.notification_logs(ride_id) WHERE ride_id IS NOT NULL;

-- ============ TRIGGERS updated_at ============
DROP TRIGGER IF EXISTS trg_unt_updated ON public.user_notification_tokens;
CREATE TRIGGER trg_unt_updated BEFORE UPDATE ON public.user_notification_tokens
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_unp_updated ON public.user_notification_preferences;
CREATE TRIGGER trg_unp_updated BEFORE UPDATE ON public.user_notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ GRANTS ============
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notification_tokens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notification_preferences TO authenticated;
GRANT SELECT ON public.notification_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notification_tokens TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notification_preferences TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_logs TO service_role;

-- ============ RLS ============
ALTER TABLE public.user_notification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS unt_select_own ON public.user_notification_tokens;
CREATE POLICY unt_select_own ON public.user_notification_tokens
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS unt_insert_own ON public.user_notification_tokens;
CREATE POLICY unt_insert_own ON public.user_notification_tokens
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS unt_update_own ON public.user_notification_tokens;
CREATE POLICY unt_update_own ON public.user_notification_tokens
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS unt_delete_own ON public.user_notification_tokens;
CREATE POLICY unt_delete_own ON public.user_notification_tokens
  FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS unp_select_own ON public.user_notification_preferences;
CREATE POLICY unp_select_own ON public.user_notification_preferences
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS unp_insert_own ON public.user_notification_preferences;
CREATE POLICY unp_insert_own ON public.user_notification_preferences
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS unp_update_own ON public.user_notification_preferences;
CREATE POLICY unp_update_own ON public.user_notification_preferences
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS nlog_select_own ON public.notification_logs;
CREATE POLICY nlog_select_own ON public.notification_logs
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ============ RPCs SEGURAS ============
CREATE OR REPLACE FUNCTION public.register_notification_token(
  _token text,
  _platform text DEFAULT 'android',
  _device_id text DEFAULT NULL,
  _permission_status text DEFAULT 'granted'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _token IS NULL OR length(btrim(_token)) < 20 THEN RAISE EXCEPTION 'invalid_token'; END IF;
  IF _platform NOT IN ('android','ios','web') THEN RAISE EXCEPTION 'invalid_platform'; END IF;
  IF _permission_status NOT IN ('granted','denied','provisional','unknown') THEN
    RAISE EXCEPTION 'invalid_permission_status';
  END IF;

  INSERT INTO public.user_notification_tokens
    (user_id, token, platform, device_id, permission_status, is_active, last_used_at)
  VALUES (_uid, btrim(_token), _platform, _device_id, _permission_status, true, now())
  ON CONFLICT (token) DO UPDATE
    SET user_id = _uid,
        platform = EXCLUDED.platform,
        device_id = COALESCE(EXCLUDED.device_id, public.user_notification_tokens.device_id),
        permission_status = EXCLUDED.permission_status,
        is_active = true,
        last_used_at = now(),
        updated_at = now()
  RETURNING id INTO _id;

  INSERT INTO public.user_notification_preferences (user_id)
  VALUES (_uid) ON CONFLICT (user_id) DO NOTHING;

  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_notification_token(_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _n int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE public.user_notification_tokens
     SET is_active = false, updated_at = now()
   WHERE token = btrim(_token) AND user_id = _uid;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_notification_preferences()
RETURNS public.user_notification_preferences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.user_notification_preferences;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  INSERT INTO public.user_notification_preferences (user_id)
  VALUES (_uid) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO _row FROM public.user_notification_preferences WHERE user_id = _uid;
  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_notification_delivery(
  _user_id uuid,
  _event text,
  _status text,
  _title text DEFAULT NULL,
  _body text DEFAULT NULL,
  _data jsonb DEFAULT '{}'::jsonb,
  _error text DEFAULT NULL,
  _ride_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  IF _status NOT IN ('sent','failed','partial','suppressed') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;
  INSERT INTO public.notification_logs (user_id, event, status, title, body, data, error, ride_id)
  VALUES (_user_id, _event, _status, _title, _body, COALESCE(_data,'{}'::jsonb), _error, _ride_id)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_notification_token(text,text,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.deactivate_notification_token(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_notification_preferences() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_notification_delivery(uuid,text,text,text,text,jsonb,text,uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.register_notification_token(text,text,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.deactivate_notification_token(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_notification_preferences() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_notification_delivery(uuid,text,text,text,text,jsonb,text,uuid) TO service_role;

-- ============ SANIDADE (sem enviar notificações) ============
DO $sanity$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM pg_tables
   WHERE schemaname='public'
     AND tablename IN ('user_notification_tokens','user_notification_preferences','notification_logs')
     AND rowsecurity;
  IF _n <> 3 THEN RAISE EXCEPTION 'sanity: RLS ausente em tabelas de push (%)', _n; END IF;

  SELECT count(*) INTO _n FROM pg_policies
   WHERE schemaname='public' AND tablename='notification_logs';
  IF _n <> 1 THEN RAISE EXCEPTION 'sanity: notification_logs deve ter apenas policy de leitura própria'; END IF;

  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace nsp ON nsp.oid=p.pronamespace
   WHERE nsp.nspname='public'
     AND p.proname IN ('register_notification_token','deactivate_notification_token',
                       'get_my_notification_preferences','log_notification_delivery')
     AND p.prosecdef
     AND 'search_path=public' = ANY(COALESCE(p.proconfig, ARRAY[]::text[]));
  IF _n <> 4 THEN RAISE EXCEPTION 'sanity: RPCs push devem ser SECURITY DEFINER com search_path fixo (%)', _n; END IF;

  IF has_function_privilege('authenticated','public.log_notification_delivery(uuid,text,text,text,text,jsonb,text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'sanity: authenticated nao pode executar log_notification_delivery';
  END IF;

  SELECT count(*) INTO _n FROM public.notification_logs;
  IF _n <> 0 THEN RAISE EXCEPTION 'sanity: migration nao deve gerar logs de envio'; END IF;
END
$sanity$;