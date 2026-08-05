-- Secure push-token registration, lifecycle and cleanup.
-- This migration does not rewrite or delete existing rows.

BEGIN;

ALTER TABLE public.user_notification_tokens
  ADD COLUMN IF NOT EXISTS device_id text,
  ADD COLUMN IF NOT EXISTS app_role text,
  ADD COLUMN IF NOT EXISTS app_version text,
  ADD COLUMN IF NOT EXISTS locale text,
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS permission_status text,
  ADD COLUMN IF NOT EXISTS registered_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_tokens_device_id_safe') THEN
    ALTER TABLE public.user_notification_tokens
      ADD CONSTRAINT notification_tokens_device_id_safe
      CHECK (device_id IS NULL OR char_length(btrim(device_id)) BETWEEN 8 AND 200) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_tokens_app_role_safe') THEN
    ALTER TABLE public.user_notification_tokens
      ADD CONSTRAINT notification_tokens_app_role_safe
      CHECK (app_role IS NULL OR app_role IN ('passageiro', 'motorista', 'admin')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_tokens_app_version_safe') THEN
    ALTER TABLE public.user_notification_tokens
      ADD CONSTRAINT notification_tokens_app_version_safe
      CHECK (app_version IS NULL OR char_length(app_version) BETWEEN 1 AND 40) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_tokens_locale_safe') THEN
    ALTER TABLE public.user_notification_tokens
      ADD CONSTRAINT notification_tokens_locale_safe
      CHECK (locale IS NULL OR locale ~ '^[A-Za-z]{2,3}([_-][A-Za-z]{2})?$') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_tokens_timezone_safe') THEN
    ALTER TABLE public.user_notification_tokens
      ADD CONSTRAINT notification_tokens_timezone_safe
      CHECK (timezone IS NULL OR char_length(timezone) BETWEEN 1 AND 100) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_tokens_permission_safe') THEN
    ALTER TABLE public.user_notification_tokens
      ADD CONSTRAINT notification_tokens_permission_safe
      CHECK (permission_status IS NULL OR permission_status IN ('prompt', 'granted', 'denied')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_tokens_success_time_safe') THEN
    ALTER TABLE public.user_notification_tokens
      ADD CONSTRAINT notification_tokens_success_time_safe
      CHECK (last_success_at IS NULL OR last_success_at >= registered_at) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_notification_tokens_user_device
  ON public.user_notification_tokens(user_id, device_id)
  WHERE device_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_notification_tokens_active_last_success
  ON public.user_notification_tokens(last_success_at DESC)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS ix_notification_tokens_permission
  ON public.user_notification_tokens(permission_status)
  WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS ux_notification_tokens_active_user_device_platform
  ON public.user_notification_tokens(user_id, device_id, platform)
  WHERE is_active = true AND device_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.register_my_notification_token(
  _token text,
  _platform text,
  _device_id text DEFAULT NULL,
  _app_role text DEFAULT NULL,
  _app_version text DEFAULT NULL,
  _locale text DEFAULT NULL,
  _timezone text DEFAULT NULL,
  _permission_status text DEFAULT 'granted'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _token_id uuid;
  _clean_token text := btrim(_token);
  _clean_platform text := lower(btrim(_platform));
  _clean_device text := NULLIF(btrim(_device_id), '');
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF char_length(_clean_token) NOT BETWEEN 20 AND 4096 THEN
    RAISE EXCEPTION 'invalid_token' USING ERRCODE = '22023';
  END IF;
  IF _clean_platform NOT IN ('android', 'ios', 'web') THEN
    RAISE EXCEPTION 'invalid_platform' USING ERRCODE = '22023';
  END IF;
  IF _clean_device IS NOT NULL AND char_length(_clean_device) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'invalid_device_id' USING ERRCODE = '22023';
  END IF;
  IF _app_role IS NOT NULL AND _app_role NOT IN ('passageiro', 'motorista', 'admin') THEN
    RAISE EXCEPTION 'invalid_app_role' USING ERRCODE = '22023';
  END IF;
  IF _permission_status IS NOT NULL AND _permission_status NOT IN ('prompt', 'granted', 'denied') THEN
    RAISE EXCEPTION 'invalid_permission_status' USING ERRCODE = '22023';
  END IF;

  -- A provider token must belong to only one current user.
  UPDATE public.user_notification_tokens
     SET is_active = false,
         invalidated_at = now(),
         last_error_code = 'token_reassigned'
   WHERE token = _clean_token
     AND user_id <> _user_id
     AND is_active = true;

  -- A device/platform keeps only one active token for the current user.
  IF _clean_device IS NOT NULL THEN
    UPDATE public.user_notification_tokens
       SET is_active = false,
           invalidated_at = now(),
           last_error_code = 'device_token_rotated'
     WHERE user_id = _user_id
       AND device_id = _clean_device
       AND platform = _clean_platform
       AND token <> _clean_token
       AND is_active = true;
  END IF;

  INSERT INTO public.user_notification_tokens (
    user_id, token, platform, device_id, app_role, app_version,
    locale, timezone, permission_status, is_active, invalidated_at,
    failure_count, last_error_code, last_seen_at, registered_at
  ) VALUES (
    _user_id, _clean_token, _clean_platform, _clean_device,
    NULLIF(btrim(_app_role), ''), NULLIF(btrim(_app_version), ''),
    NULLIF(btrim(_locale), ''), NULLIF(btrim(_timezone), ''),
    COALESCE(_permission_status, 'granted'), true, NULL, 0, NULL, now(), now()
  )
  ON CONFLICT (token) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    platform = EXCLUDED.platform,
    device_id = EXCLUDED.device_id,
    app_role = EXCLUDED.app_role,
    app_version = EXCLUDED.app_version,
    locale = EXCLUDED.locale,
    timezone = EXCLUDED.timezone,
    permission_status = EXCLUDED.permission_status,
    is_active = true,
    invalidated_at = NULL,
    failure_count = 0,
    last_error_code = NULL,
    last_seen_at = now()
  RETURNING id INTO _token_id;

  RETURN _token_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_my_notification_token(
  _token text,
  _reason text DEFAULT 'user_logout'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _affected integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF char_length(btrim(_token)) NOT BETWEEN 20 AND 4096 THEN
    RAISE EXCEPTION 'invalid_token' USING ERRCODE = '22023';
  END IF;

  UPDATE public.user_notification_tokens
     SET is_active = false,
         invalidated_at = COALESCE(invalidated_at, now()),
         last_error_code = left(COALESCE(NULLIF(btrim(_reason), ''), 'user_logout'), 100)
   WHERE user_id = auth.uid()
     AND token = btrim(_token)
     AND is_active = true;
  GET DIAGNOSTICS _affected = ROW_COUNT;
  RETURN _affected > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_notification_tokens(
  _invalid_retention_days integer DEFAULT 30,
  _inactive_retention_days integer DEFAULT 180,
  _batch_size integer DEFAULT 500
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted integer;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF _invalid_retention_days NOT BETWEEN 7 AND 3650
     OR _inactive_retention_days NOT BETWEEN 30 AND 3650
     OR _batch_size NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'invalid_cleanup_parameters' USING ERRCODE = '22023';
  END IF;

  WITH candidates AS (
    SELECT id
      FROM public.user_notification_tokens
     WHERE (is_active = false AND invalidated_at < now() - make_interval(days => _invalid_retention_days))
        OR (is_active = true AND COALESCE(last_seen_at, registered_at, created_at) < now() - make_interval(days => _inactive_retention_days))
     ORDER BY COALESCE(invalidated_at, last_seen_at, registered_at, created_at)
     LIMIT _batch_size
     FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.user_notification_tokens t
   USING candidates c
   WHERE t.id = c.id;
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.register_my_notification_token(text,text,text,text,text,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.deactivate_my_notification_token(text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cleanup_notification_tokens(integer,integer,integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.register_my_notification_token(text,text,text,text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_my_notification_token(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_notification_tokens(integer,integer,integer) TO service_role;

COMMIT;
