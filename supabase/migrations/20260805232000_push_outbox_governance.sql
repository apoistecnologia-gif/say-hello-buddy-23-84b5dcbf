-- Governança segura da fila de notificações push.
-- Este migration adiciona 30 proteções reais sem reescrever dados existentes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.push_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event text NOT NULL,
  title text NOT NULL,
  body text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority smallint NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'queued',
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  sent_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  expires_at timestamptz,
  deduplication_key text,
  last_error_code text,
  last_error_message text,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.push_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid NOT NULL REFERENCES public.push_outbox(id) ON DELETE CASCADE,
  token_id uuid,
  attempt_number integer NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  http_status integer,
  provider_code text,
  provider_message_id text,
  duration_ms integer,
  success boolean NOT NULL DEFAULT false,
  permanent_failure boolean NOT NULL DEFAULT false,
  response_excerpt text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 1-10: checks de integridade da fila.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_outbox_event_safe') THEN
    ALTER TABLE public.push_outbox ADD CONSTRAINT push_outbox_event_safe CHECK (char_length(event) BETWEEN 3 AND 80) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_outbox_title_safe') THEN
    ALTER TABLE public.push_outbox ADD CONSTRAINT push_outbox_title_safe CHECK (char_length(title) BETWEEN 1 AND 100) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_outbox_body_safe') THEN
    ALTER TABLE public.push_outbox ADD CONSTRAINT push_outbox_body_safe CHECK (body IS NULL OR char_length(body) <= 500) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_outbox_priority_safe') THEN
    ALTER TABLE public.push_outbox ADD CONSTRAINT push_outbox_priority_safe CHECK (priority BETWEEN 1 AND 9) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_outbox_status_safe') THEN
    ALTER TABLE public.push_outbox ADD CONSTRAINT push_outbox_status_safe CHECK (status IN ('queued','processing','sent','failed','cancelled','expired')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_outbox_attempt_count_safe') THEN
    ALTER TABLE public.push_outbox ADD CONSTRAINT push_outbox_attempt_count_safe CHECK (attempt_count >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_outbox_max_attempts_safe') THEN
    ALTER TABLE public.push_outbox ADD CONSTRAINT push_outbox_max_attempts_safe CHECK (max_attempts BETWEEN 1 AND 10) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_outbox_attempts_bounded') THEN
    ALTER TABLE public.push_outbox ADD CONSTRAINT push_outbox_attempts_bounded CHECK (attempt_count <= max_attempts) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_outbox_expiry_safe') THEN
    ALTER TABLE public.push_outbox ADD CONSTRAINT push_outbox_expiry_safe CHECK (expires_at IS NULL OR expires_at > created_at) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_outbox_payload_object') THEN
    ALTER TABLE public.push_outbox ADD CONSTRAINT push_outbox_payload_object CHECK (jsonb_typeof(payload) = 'object') NOT VALID;
  END IF;
END $$;

-- 11-18: checks das tentativas.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_attempt_number_safe') THEN
    ALTER TABLE public.push_delivery_attempts ADD CONSTRAINT push_attempt_number_safe CHECK (attempt_number BETWEEN 1 AND 10) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_attempt_http_status_safe') THEN
    ALTER TABLE public.push_delivery_attempts ADD CONSTRAINT push_attempt_http_status_safe CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_attempt_duration_safe') THEN
    ALTER TABLE public.push_delivery_attempts ADD CONSTRAINT push_attempt_duration_safe CHECK (duration_ms IS NULL OR duration_ms BETWEEN 0 AND 120000) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_attempt_finished_safe') THEN
    ALTER TABLE public.push_delivery_attempts ADD CONSTRAINT push_attempt_finished_safe CHECK (finished_at IS NULL OR finished_at >= started_at) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_attempt_response_safe') THEN
    ALTER TABLE public.push_delivery_attempts ADD CONSTRAINT push_attempt_response_safe CHECK (response_excerpt IS NULL OR char_length(response_excerpt) <= 1000) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_attempt_success_consistent') THEN
    ALTER TABLE public.push_delivery_attempts ADD CONSTRAINT push_attempt_success_consistent CHECK (NOT success OR permanent_failure = false) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_attempt_provider_code_safe') THEN
    ALTER TABLE public.push_delivery_attempts ADD CONSTRAINT push_attempt_provider_code_safe CHECK (provider_code IS NULL OR char_length(provider_code) <= 120) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_attempt_provider_id_safe') THEN
    ALTER TABLE public.push_delivery_attempts ADD CONSTRAINT push_attempt_provider_id_safe CHECK (provider_message_id IS NULL OR char_length(provider_message_id) <= 500) NOT VALID;
  END IF;
END $$;

-- 19-25: deduplicação e índices operacionais.
CREATE UNIQUE INDEX IF NOT EXISTS ux_push_outbox_dedup_active
  ON public.push_outbox(deduplication_key)
  WHERE deduplication_key IS NOT NULL AND status IN ('queued','processing','sent');
CREATE INDEX IF NOT EXISTS ix_push_outbox_ready
  ON public.push_outbox(priority DESC, available_at, created_at)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS ix_push_outbox_locked
  ON public.push_outbox(locked_at)
  WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS ix_push_outbox_user_created
  ON public.push_outbox(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_push_outbox_expired
  ON public.push_outbox(expires_at)
  WHERE status IN ('queued','processing') AND expires_at IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_push_attempt_number
  ON public.push_delivery_attempts(outbox_id, token_id, attempt_number);
CREATE INDEX IF NOT EXISTS ix_push_attempts_outbox_created
  ON public.push_delivery_attempts(outbox_id, created_at DESC);

-- 26: updated_at automático.
CREATE OR REPLACE FUNCTION public.touch_push_outbox_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_touch_push_outbox_updated_at ON public.push_outbox;
CREATE TRIGGER trg_touch_push_outbox_updated_at
BEFORE UPDATE ON public.push_outbox
FOR EACH ROW EXECUTE FUNCTION public.touch_push_outbox_updated_at();

-- 27: claim atômico com SKIP LOCKED.
CREATE OR REPLACE FUNCTION public.claim_push_outbox(_worker text, _limit integer DEFAULT 50)
RETURNS SETOF public.push_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(char_length(btrim(_worker)),0) < 3 THEN RAISE EXCEPTION 'invalid_worker'; END IF;
  IF _limit < 1 OR _limit > 200 THEN RAISE EXCEPTION 'invalid_limit'; END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT id FROM public.push_outbox
    WHERE status='queued'
      AND available_at <= now()
      AND (expires_at IS NULL OR expires_at > now())
      AND attempt_count < max_attempts
    ORDER BY priority DESC, available_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  UPDATE public.push_outbox p
  SET status='processing', locked_at=now(), locked_by=_worker, attempt_count=p.attempt_count+1
  FROM candidates c
  WHERE p.id=c.id
  RETURNING p.*;
END;
$$;

-- 28: liberação segura de locks antigos.
CREATE OR REPLACE FUNCTION public.release_stale_push_locks(_older_than interval DEFAULT interval '5 minutes', _limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE affected integer;
BEGIN
  IF _older_than < interval '1 minute' OR _older_than > interval '1 day' THEN RAISE EXCEPTION 'invalid_interval'; END IF;
  WITH stale AS (
    SELECT id FROM public.push_outbox
    WHERE status='processing' AND locked_at < now()-_older_than
    ORDER BY locked_at
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(_limit, 2000))
  )
  UPDATE public.push_outbox p
  SET status='queued', locked_at=NULL, locked_by=NULL, available_at=now()+interval '30 seconds'
  FROM stale s WHERE p.id=s.id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- 29: expiração em lote.
CREATE OR REPLACE FUNCTION public.expire_push_outbox(_limit integer DEFAULT 1000)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE affected integer;
BEGIN
  WITH due AS (
    SELECT id FROM public.push_outbox
    WHERE status IN ('queued','processing') AND expires_at IS NOT NULL AND expires_at <= now()
    ORDER BY expires_at
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(_limit, 5000))
  )
  UPDATE public.push_outbox p
  SET status='expired', locked_at=NULL, locked_by=NULL
  FROM due d WHERE p.id=d.id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- 30: RLS e privilégios mínimos.
ALTER TABLE public.push_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_delivery_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_outbox, public.push_delivery_attempts FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_push_outbox_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_push_outbox(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_stale_push_locks(interval, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_push_outbox(integer) FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.push_outbox, public.push_delivery_attempts TO service_role;
GRANT EXECUTE ON FUNCTION public.touch_push_outbox_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_push_outbox(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_stale_push_locks(interval, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_push_outbox(integer) TO service_role;

COMMIT;
