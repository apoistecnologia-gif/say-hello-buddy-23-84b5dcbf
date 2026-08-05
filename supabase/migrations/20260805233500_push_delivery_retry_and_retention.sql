-- Strengthen push delivery retries, deduplication and retention.
-- This migration is additive and avoids rewriting legacy rows.

BEGIN;

-- 1-12: delivery lifecycle metadata.
ALTER TABLE public.notification_logs
  ADD COLUMN IF NOT EXISTS delivery_key text,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_error_code text,
  ADD COLUMN IF NOT EXISTS provider_http_status integer,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by uuid;

-- 13-20: defensive constraints, left NOT VALID for legacy compatibility.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_logs_attempt_count_safe') THEN
    ALTER TABLE public.notification_logs
      ADD CONSTRAINT notification_logs_attempt_count_safe
      CHECK (attempt_count >= 0 AND attempt_count <= 20) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_logs_http_status_safe') THEN
    ALTER TABLE public.notification_logs
      ADD CONSTRAINT notification_logs_http_status_safe
      CHECK (provider_http_status IS NULL OR provider_http_status BETWEEN 100 AND 599) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_logs_delivery_key_safe') THEN
    ALTER TABLE public.notification_logs
      ADD CONSTRAINT notification_logs_delivery_key_safe
      CHECK (delivery_key IS NULL OR char_length(delivery_key) BETWEEN 8 AND 200) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_logs_provider_error_safe') THEN
    ALTER TABLE public.notification_logs
      ADD CONSTRAINT notification_logs_provider_error_safe
      CHECK (provider_error_code IS NULL OR char_length(provider_error_code) <= 160) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_logs_attempt_dates_consistent') THEN
    ALTER TABLE public.notification_logs
      ADD CONSTRAINT notification_logs_attempt_dates_consistent
      CHECK (last_attempt_at IS NULL OR first_attempt_at IS NULL OR last_attempt_at >= first_attempt_at) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_logs_delivered_consistent') THEN
    ALTER TABLE public.notification_logs
      ADD CONSTRAINT notification_logs_delivered_consistent
      CHECK (delivered_at IS NULL OR status = 'sent') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_logs_failed_consistent') THEN
    ALTER TABLE public.notification_logs
      ADD CONSTRAINT notification_logs_failed_consistent
      CHECK (failed_at IS NULL OR status = 'failed') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_logs_expiry_consistent') THEN
    ALTER TABLE public.notification_logs
      ADD CONSTRAINT notification_logs_expiry_consistent
      CHECK (expires_at IS NULL OR expires_at >= created_at) NOT VALID;
  END IF;
END $$;

-- 21-27: operational and retention indexes.
CREATE UNIQUE INDEX IF NOT EXISTS ux_notification_logs_delivery_key
  ON public.notification_logs(delivery_key)
  WHERE delivery_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_notification_logs_retry_due
  ON public.notification_logs(next_attempt_at, created_at)
  WHERE status = 'failed' AND next_attempt_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_notification_logs_unlocked_retry
  ON public.notification_logs(next_attempt_at)
  WHERE status = 'failed' AND locked_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_notification_logs_expired
  ON public.notification_logs(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_notification_logs_delivered_at
  ON public.notification_logs(delivered_at DESC)
  WHERE delivered_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_notification_logs_failed_at
  ON public.notification_logs(failed_at DESC)
  WHERE failed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_notification_logs_provider_error
  ON public.notification_logs(provider_error_code, created_at DESC)
  WHERE provider_error_code IS NOT NULL;

-- 28: atomically claim due retries.
CREATE OR REPLACE FUNCTION public.claim_push_notification_retries(
  _worker_id uuid,
  _limit integer DEFAULT 100
)
RETURNS SETOF public.notification_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _worker_id IS NULL THEN
    RAISE EXCEPTION 'worker_id_required';
  END IF;
  IF _limit < 1 OR _limit > 500 THEN
    RAISE EXCEPTION 'invalid_limit';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM public.notification_logs
    WHERE status = 'failed'
      AND next_attempt_at IS NOT NULL
      AND next_attempt_at <= now()
      AND (expires_at IS NULL OR expires_at > now())
      AND (locked_at IS NULL OR locked_at < now() - interval '5 minutes')
      AND attempt_count < 10
    ORDER BY next_attempt_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  UPDATE public.notification_logs logs
  SET locked_at = now(),
      locked_by = _worker_id,
      attempt_count = logs.attempt_count + 1,
      first_attempt_at = COALESCE(logs.first_attempt_at, now()),
      last_attempt_at = now(),
      updated_at = now()
  FROM candidates
  WHERE logs.id = candidates.id
  RETURNING logs.*;
END;
$$;

-- 29: release stale retry locks without changing delivery outcome.
CREATE OR REPLACE FUNCTION public.release_stale_push_retry_locks(
  _older_than interval DEFAULT interval '10 minutes'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  IF _older_than < interval '1 minute' OR _older_than > interval '24 hours' THEN
    RAISE EXCEPTION 'invalid_interval';
  END IF;

  UPDATE public.notification_logs
  SET locked_at = NULL,
      locked_by = NULL,
      updated_at = now()
  WHERE locked_at IS NOT NULL
    AND locked_at < now() - _older_than
    AND status = 'failed';

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- 30: retention cleanup in bounded batches.
CREATE OR REPLACE FUNCTION public.cleanup_push_notification_logs(
  _sent_retention_days integer DEFAULT 90,
  _failed_retention_days integer DEFAULT 180,
  _limit integer DEFAULT 1000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  IF _sent_retention_days < 30 OR _sent_retention_days > 730 THEN
    RAISE EXCEPTION 'invalid_sent_retention';
  END IF;
  IF _failed_retention_days < 30 OR _failed_retention_days > 730 THEN
    RAISE EXCEPTION 'invalid_failed_retention';
  END IF;
  IF _limit < 1 OR _limit > 10000 THEN
    RAISE EXCEPTION 'invalid_limit';
  END IF;

  WITH doomed AS (
    SELECT id
    FROM public.notification_logs
    WHERE (status = 'sent' AND created_at < now() - make_interval(days => _sent_retention_days))
       OR (status = 'failed' AND created_at < now() - make_interval(days => _failed_retention_days))
       OR (expires_at IS NOT NULL AND expires_at < now() - interval '7 days')
    ORDER BY created_at
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.notification_logs logs
  USING doomed
  WHERE logs.id = doomed.id;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_push_notification_retries(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_stale_push_retry_locks(interval) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_push_notification_logs(integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_notification_retries(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_stale_push_retry_locks(interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_push_notification_logs(integer, integer, integer) TO service_role;

COMMIT;
