-- Production-grade push outbox and delivery controls.
BEGIN;

CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event text NOT NULL,
  title text NOT NULL,
  body text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  channel text NOT NULL DEFAULT 'fcm',
  priority text NOT NULL DEFAULT 'high',
  status text NOT NULL DEFAULT 'pending',
  idempotency_key text NOT NULL,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  provider_message_id text,
  last_error_code text,
  last_error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_outbox_event_length CHECK (char_length(event) BETWEEN 3 AND 80),
  CONSTRAINT notification_outbox_title_length CHECK (char_length(title) BETWEEN 1 AND 120),
  CONSTRAINT notification_outbox_body_length CHECK (body IS NULL OR char_length(body) <= 1000),
  CONSTRAINT notification_outbox_channel CHECK (channel IN ('fcm')),
  CONSTRAINT notification_outbox_priority CHECK (priority IN ('normal','high')),
  CONSTRAINT notification_outbox_status CHECK (status IN ('pending','processing','sent','failed','cancelled')),
  CONSTRAINT notification_outbox_attempt_count CHECK (attempt_count >= 0),
  CONSTRAINT notification_outbox_max_attempts CHECK (max_attempts BETWEEN 1 AND 20),
  CONSTRAINT notification_outbox_attempts_bounded CHECK (attempt_count <= max_attempts),
  CONSTRAINT notification_outbox_idempotency_length CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  CONSTRAINT notification_outbox_data_object CHECK (jsonb_typeof(data) = 'object'),
  CONSTRAINT notification_outbox_lock_consistency CHECK ((status = 'processing') = (locked_at IS NOT NULL)),
  CONSTRAINT notification_outbox_sent_consistency CHECK ((status = 'sent') = (sent_at IS NOT NULL)),
  CONSTRAINT notification_outbox_failed_consistency CHECK ((status = 'failed') = (failed_at IS NOT NULL)),
  CONSTRAINT notification_outbox_cancelled_consistency CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.notification_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid NOT NULL REFERENCES public.notification_outbox(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_id uuid,
  attempt_number integer NOT NULL,
  provider text NOT NULL DEFAULT 'fcm',
  http_status integer,
  provider_status text,
  provider_message_id text,
  error_code text,
  error_message text,
  is_permanent_failure boolean NOT NULL DEFAULT false,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_delivery_attempt_number CHECK (attempt_number BETWEEN 1 AND 20),
  CONSTRAINT notification_delivery_provider CHECK (provider IN ('fcm')),
  CONSTRAINT notification_delivery_http_status CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  CONSTRAINT notification_delivery_duration CHECK (duration_ms IS NULL OR duration_ms BETWEEN 0 AND 120000),
  CONSTRAINT notification_delivery_error_length CHECK (error_message IS NULL OR char_length(error_message) <= 1000)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_notification_outbox_idempotency
  ON public.notification_outbox(idempotency_key);
CREATE INDEX IF NOT EXISTS ix_notification_outbox_ready
  ON public.notification_outbox(next_attempt_at, priority, created_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS ix_notification_outbox_processing
  ON public.notification_outbox(locked_at)
  WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS ix_notification_outbox_user_created
  ON public.notification_outbox(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_notification_outbox_event_created
  ON public.notification_outbox(event, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_notification_outbox_status_created
  ON public.notification_outbox(status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_notification_delivery_outbox_created
  ON public.notification_delivery_attempts(outbox_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_notification_delivery_user_created
  ON public.notification_delivery_attempts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_notification_delivery_permanent_failure
  ON public.notification_delivery_attempts(created_at DESC)
  WHERE is_permanent_failure = true;

CREATE OR REPLACE FUNCTION public.touch_notification_outbox_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_notification_outbox_updated_at ON public.notification_outbox;
CREATE TRIGGER trg_touch_notification_outbox_updated_at
BEFORE UPDATE ON public.notification_outbox
FOR EACH ROW EXECUTE FUNCTION public.touch_notification_outbox_updated_at();

CREATE OR REPLACE FUNCTION public.claim_notification_outbox_batch(
  _worker_id text,
  _limit integer DEFAULT 50
)
RETURNS SETOF public.notification_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _worker_id IS NULL OR char_length(btrim(_worker_id)) NOT BETWEEN 3 AND 120 THEN
    RAISE EXCEPTION 'invalid_worker_id';
  END IF;
  IF _limit < 1 OR _limit > 200 THEN
    RAISE EXCEPTION 'invalid_limit';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM public.notification_outbox
    WHERE status = 'pending'
      AND scheduled_at <= now()
      AND next_attempt_at <= now()
      AND attempt_count < max_attempts
    ORDER BY CASE priority WHEN 'high' THEN 0 ELSE 1 END, next_attempt_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  UPDATE public.notification_outbox o
  SET status = 'processing',
      locked_at = now(),
      locked_by = btrim(_worker_id),
      last_attempt_at = now(),
      attempt_count = attempt_count + 1
  FROM candidates c
  WHERE o.id = c.id
  RETURNING o.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_notification_outbox(
  _id uuid,
  _worker_id text,
  _provider_message_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed integer;
BEGIN
  UPDATE public.notification_outbox
  SET status = 'sent',
      sent_at = now(),
      locked_at = NULL,
      locked_by = NULL,
      provider_message_id = NULLIF(btrim(_provider_message_id), ''),
      last_error_code = NULL,
      last_error_message = NULL
  WHERE id = _id
    AND status = 'processing'
    AND locked_by = btrim(_worker_id);
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_notification_outbox(
  _id uuid,
  _worker_id text,
  _error_code text,
  _error_message text,
  _retry_after_seconds integer DEFAULT 60,
  _permanent boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed integer;
BEGIN
  IF _retry_after_seconds < 0 OR _retry_after_seconds > 86400 THEN
    RAISE EXCEPTION 'invalid_retry_delay';
  END IF;

  UPDATE public.notification_outbox
  SET status = CASE WHEN _permanent OR attempt_count >= max_attempts THEN 'failed' ELSE 'pending' END,
      failed_at = CASE WHEN _permanent OR attempt_count >= max_attempts THEN now() ELSE NULL END,
      next_attempt_at = CASE WHEN _permanent OR attempt_count >= max_attempts THEN next_attempt_at ELSE now() + make_interval(secs => _retry_after_seconds) END,
      locked_at = NULL,
      locked_by = NULL,
      last_error_code = left(NULLIF(btrim(_error_code), ''), 120),
      last_error_message = left(NULLIF(btrim(_error_message), ''), 1000)
  WHERE id = _id
    AND status = 'processing'
    AND locked_by = btrim(_worker_id);
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_stale_notification_outbox(
  _older_than_minutes integer DEFAULT 10,
  _limit integer DEFAULT 200
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed integer;
BEGIN
  IF _older_than_minutes < 1 OR _older_than_minutes > 1440 THEN
    RAISE EXCEPTION 'invalid_stale_window';
  END IF;
  IF _limit < 1 OR _limit > 1000 THEN
    RAISE EXCEPTION 'invalid_limit';
  END IF;

  WITH stale AS (
    SELECT id
    FROM public.notification_outbox
    WHERE status = 'processing'
      AND locked_at < now() - make_interval(mins => _older_than_minutes)
    ORDER BY locked_at
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  UPDATE public.notification_outbox o
  SET status = CASE WHEN attempt_count >= max_attempts THEN 'failed' ELSE 'pending' END,
      failed_at = CASE WHEN attempt_count >= max_attempts THEN now() ELSE NULL END,
      next_attempt_at = CASE WHEN attempt_count >= max_attempts THEN next_attempt_at ELSE now() + interval '60 seconds' END,
      locked_at = NULL,
      locked_by = NULL,
      last_error_code = 'worker_timeout',
      last_error_message = 'Delivery worker lock expired'
  FROM stale s
  WHERE o.id = s.id;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$;

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_attempts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notification_outbox' AND policyname='notification_outbox_select_own') THEN
    CREATE POLICY notification_outbox_select_own ON public.notification_outbox
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notification_delivery_attempts' AND policyname='notification_delivery_attempts_select_own') THEN
    CREATE POLICY notification_delivery_attempts_select_own ON public.notification_delivery_attempts
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

REVOKE INSERT, UPDATE, DELETE ON public.notification_outbox FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.notification_delivery_attempts FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_notification_outbox_batch(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_notification_outbox(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_notification_outbox(uuid, text, text, text, integer, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_stale_notification_outbox(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_outbox_batch(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_notification_outbox(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_notification_outbox(uuid, text, text, text, integer, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_stale_notification_outbox(integer, integer) TO service_role;
GRANT SELECT ON public.notification_outbox TO authenticated;
GRANT SELECT ON public.notification_delivery_attempts TO authenticated;

COMMIT;
