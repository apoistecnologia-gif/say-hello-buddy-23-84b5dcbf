-- Consolidate token delivery health without deleting historical registrations.
BEGIN;

ALTER TABLE public.user_notification_tokens
  ADD COLUMN IF NOT EXISTS last_failure_at timestamptz,
  ADD COLUMN IF NOT EXISTS consecutive_failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disabled_reason text,
  ADD COLUMN IF NOT EXISTS provider_name text NOT NULL DEFAULT 'fcm',
  ADD COLUMN IF NOT EXISTS last_provider_http_status integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_tokens_consecutive_failures_safe') THEN
    ALTER TABLE public.user_notification_tokens
      ADD CONSTRAINT notification_tokens_consecutive_failures_safe
      CHECK (consecutive_failure_count BETWEEN 0 AND 1000) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_tokens_disabled_reason_safe') THEN
    ALTER TABLE public.user_notification_tokens
      ADD CONSTRAINT notification_tokens_disabled_reason_safe
      CHECK (disabled_reason IS NULL OR char_length(btrim(disabled_reason)) BETWEEN 3 AND 120) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_tokens_provider_safe') THEN
    ALTER TABLE public.user_notification_tokens
      ADD CONSTRAINT notification_tokens_provider_safe
      CHECK (provider_name IN ('fcm','apns','webpush')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_tokens_provider_status_safe') THEN
    ALTER TABLE public.user_notification_tokens
      ADD CONSTRAINT notification_tokens_provider_status_safe
      CHECK (last_provider_http_status IS NULL OR last_provider_http_status BETWEEN 100 AND 599) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_tokens_failure_time_safe') THEN
    ALTER TABLE public.user_notification_tokens
      ADD CONSTRAINT notification_tokens_failure_time_safe
      CHECK (last_failure_at IS NULL OR last_failure_at >= registered_at) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_tokens_active_state_safe') THEN
    ALTER TABLE public.user_notification_tokens
      ADD CONSTRAINT notification_tokens_active_state_safe
      CHECK (
        (is_active = true AND invalidated_at IS NULL AND disabled_reason IS NULL)
        OR
        (is_active = false AND invalidated_at IS NOT NULL)
      ) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_notification_tokens_active_delivery
  ON public.user_notification_tokens(user_id, platform, last_success_at DESC)
  WHERE is_active = true AND permission_status = 'granted';

CREATE INDEX IF NOT EXISTS ix_notification_tokens_failure_health
  ON public.user_notification_tokens(consecutive_failure_count DESC, last_failure_at DESC)
  WHERE is_active = true AND consecutive_failure_count > 0;

CREATE INDEX IF NOT EXISTS ix_notification_tokens_disabled_reason
  ON public.user_notification_tokens(disabled_reason, invalidated_at DESC)
  WHERE is_active = false;

CREATE INDEX IF NOT EXISTS ix_notification_tokens_provider_status
  ON public.user_notification_tokens(last_provider_http_status, last_failure_at DESC)
  WHERE last_provider_http_status IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_push_token_success(
  _token text,
  _provider_message_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clean_token text := btrim(_token);
BEGIN
  IF char_length(_clean_token) NOT BETWEEN 20 AND 4096 THEN
    RAISE EXCEPTION 'invalid_token' USING ERRCODE = '22023';
  END IF;
  IF _provider_message_id IS NOT NULL AND char_length(btrim(_provider_message_id)) > 500 THEN
    RAISE EXCEPTION 'invalid_provider_message_id' USING ERRCODE = '22023';
  END IF;

  UPDATE public.user_notification_tokens
     SET last_used_at = now(),
         last_success_at = now(),
         last_failure_at = NULL,
         failure_count = 0,
         consecutive_failure_count = 0,
         last_error_code = NULL,
         last_provider_http_status = NULL,
         updated_at = now()
   WHERE token = _clean_token
     AND is_active = true;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_push_token_failure(
  _token text,
  _error_code text,
  _http_status integer DEFAULT NULL,
  _permanent boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clean_token text := btrim(_token);
  _clean_error text := left(COALESCE(NULLIF(btrim(_error_code),''),'unknown_error'),120);
  _new_status text;
BEGIN
  IF char_length(_clean_token) NOT BETWEEN 20 AND 4096 THEN
    RAISE EXCEPTION 'invalid_token' USING ERRCODE = '22023';
  END IF;
  IF _http_status IS NOT NULL AND (_http_status < 100 OR _http_status > 599) THEN
    RAISE EXCEPTION 'invalid_http_status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.user_notification_tokens
     SET last_used_at = now(),
         last_failure_at = now(),
         failure_count = LEAST(COALESCE(failure_count,0) + 1, 1000),
         consecutive_failure_count = LEAST(consecutive_failure_count + 1, 1000),
         last_error_code = _clean_error,
         last_provider_http_status = _http_status,
         is_active = CASE WHEN _permanent THEN false ELSE is_active END,
         invalidated_at = CASE WHEN _permanent THEN COALESCE(invalidated_at,now()) ELSE invalidated_at END,
         disabled_reason = CASE WHEN _permanent THEN _clean_error ELSE disabled_reason END,
         updated_at = now()
   WHERE token = _clean_token;

  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  _new_status := CASE WHEN _permanent THEN 'disabled' ELSE 'recorded' END;
  RETURN _new_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.reactivate_push_token_after_refresh(
  _old_token text,
  _new_token text,
  _user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _old text := btrim(_old_token);
  _new text := btrim(_new_token);
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_required' USING ERRCODE='22023'; END IF;
  IF char_length(_old) NOT BETWEEN 20 AND 4096 OR char_length(_new) NOT BETWEEN 20 AND 4096 THEN
    RAISE EXCEPTION 'invalid_token' USING ERRCODE='22023';
  END IF;
  IF _old = _new THEN RETURN false; END IF;

  UPDATE public.user_notification_tokens
     SET is_active=false,
         invalidated_at=COALESCE(invalidated_at,now()),
         disabled_reason='token_refreshed',
         last_error_code='token_refreshed',
         updated_at=now()
   WHERE token=_old AND user_id=_user_id AND is_active=true;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_stale_push_tokens(
  _inactive_retention_days integer DEFAULT 180,
  _active_stale_days integer DEFAULT 365,
  _limit integer DEFAULT 500
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _affected integer;
BEGIN
  IF _inactive_retention_days < 30 OR _inactive_retention_days > 1460 THEN
    RAISE EXCEPTION 'invalid_inactive_retention';
  END IF;
  IF _active_stale_days < 90 OR _active_stale_days > 1460 THEN
    RAISE EXCEPTION 'invalid_active_stale_window';
  END IF;
  IF _limit < 1 OR _limit > 5000 THEN
    RAISE EXCEPTION 'invalid_limit';
  END IF;

  WITH candidates AS (
    SELECT id
      FROM public.user_notification_tokens
     WHERE (is_active=false AND invalidated_at < now()-make_interval(days=>_inactive_retention_days))
        OR (is_active=true AND COALESCE(last_used_at,registered_at,created_at) < now()-make_interval(days=>_active_stale_days))
     ORDER BY COALESCE(invalidated_at,last_used_at,registered_at,created_at)
     LIMIT _limit
     FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.user_notification_tokens tokens
   USING candidates
   WHERE tokens.id=candidates.id;

  GET DIAGNOSTICS _affected = ROW_COUNT;
  RETURN _affected;
END;
$$;

REVOKE ALL ON FUNCTION public.record_push_token_success(text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_push_token_failure(text,text,integer,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reactivate_push_token_after_refresh(text,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_stale_push_tokens(integer,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_push_token_success(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_push_token_failure(text,text,integer,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.reactivate_push_token_after_refresh(text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_push_tokens(integer,integer,integer) TO service_role;

COMMIT;
