-- Push delivery outbox with idempotency, bounded retries and service-role-only processing.
BEGIN;

CREATE TABLE IF NOT EXISTS public.push_delivery_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event text NOT NULL,
  title text NOT NULL,
  body text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  priority smallint NOT NULL DEFAULT 5,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  last_error_code text,
  last_error_at timestamptz,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_outbox_dedupe_length_safe') THEN
    ALTER TABLE public.push_delivery_outbox
      ADD CONSTRAINT push_outbox_dedupe_length_safe CHECK (char_length(btrim(dedupe_key)) BETWEEN 8 AND 200);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_outbox_event_safe') THEN
    ALTER TABLE public.push_delivery_outbox
      ADD CONSTRAINT push_outbox_event_safe CHECK (event ~ '^[a-z0-9_.-]{3,80}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_outbox_title_safe') THEN
    ALTER TABLE public.push_delivery_outbox
      ADD CONSTRAINT push_outbox_title_safe CHECK (char_length(btrim(title)) BETWEEN 1 AND 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_outbox_body_safe') THEN
    ALTER TABLE public.push_delivery_outbox
      ADD CONSTRAINT push_outbox_body_safe CHECK (body IS NULL OR char_length(body) <= 500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_outbox_data_object_safe') THEN
    ALTER TABLE public.push_delivery_outbox
      ADD CONSTRAINT push_outbox_data_object_safe CHECK (jsonb_typeof(data) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_outbox_status_safe') THEN
    ALTER TABLE public.push_delivery_outbox
      ADD CONSTRAINT push_outbox_status_safe CHECK (status IN ('pending','processing','sent','failed','dead_letter','cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_outbox_priority_safe') THEN
    ALTER TABLE public.push_delivery_outbox
      ADD CONSTRAINT push_outbox_priority_safe CHECK (priority BETWEEN 1 AND 9);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_outbox_attempts_safe') THEN
    ALTER TABLE public.push_delivery_outbox
      ADD CONSTRAINT push_outbox_attempts_safe CHECK (attempt_count >= 0 AND max_attempts BETWEEN 1 AND 10 AND attempt_count <= max_attempts);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_outbox_lock_consistent') THEN
    ALTER TABLE public.push_delivery_outbox
      ADD CONSTRAINT push_outbox_lock_consistent CHECK ((locked_at IS NULL) = (locked_by IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_outbox_sent_consistent') THEN
    ALTER TABLE public.push_delivery_outbox
      ADD CONSTRAINT push_outbox_sent_consistent CHECK ((status = 'sent') = (sent_at IS NOT NULL));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_push_outbox_dedupe_key ON public.push_delivery_outbox(dedupe_key);
CREATE INDEX IF NOT EXISTS ix_push_outbox_ready ON public.push_delivery_outbox(priority, next_attempt_at, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS ix_push_outbox_processing_stale ON public.push_delivery_outbox(locked_at) WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS ix_push_outbox_user_created ON public.push_delivery_outbox(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_push_outbox_status_created ON public.push_delivery_outbox(status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_push_outbox_dead_letter ON public.push_delivery_outbox(updated_at DESC) WHERE status = 'dead_letter';

CREATE OR REPLACE FUNCTION public.touch_push_delivery_outbox_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_push_delivery_outbox_updated_at ON public.push_delivery_outbox;
CREATE TRIGGER trg_touch_push_delivery_outbox_updated_at
BEFORE UPDATE ON public.push_delivery_outbox
FOR EACH ROW EXECUTE FUNCTION public.touch_push_delivery_outbox_updated_at();

CREATE OR REPLACE FUNCTION public.enqueue_push_delivery(
  _dedupe_key text,
  _user_id uuid,
  _event text,
  _title text,
  _body text DEFAULT NULL,
  _data jsonb DEFAULT '{}'::jsonb,
  _priority smallint DEFAULT 5,
  _max_attempts integer DEFAULT 5
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  INSERT INTO public.push_delivery_outbox(dedupe_key,user_id,event,title,body,data,priority,max_attempts)
  VALUES (btrim(_dedupe_key),_user_id,btrim(_event),btrim(_title),_body,COALESCE(_data,'{}'::jsonb),_priority,_max_attempts)
  ON CONFLICT (dedupe_key) DO UPDATE SET dedupe_key = EXCLUDED.dedupe_key
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_push_delivery_batch(_worker_id text, _limit integer DEFAULT 50)
RETURNS SETOF public.push_delivery_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _worker_id IS NULL OR char_length(btrim(_worker_id)) NOT BETWEEN 3 AND 100 THEN
    RAISE EXCEPTION 'invalid_worker_id';
  END IF;
  IF _limit < 1 OR _limit > 100 THEN
    RAISE EXCEPTION 'invalid_limit';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM public.push_delivery_outbox
    WHERE status = 'pending' AND next_attempt_at <= now()
    ORDER BY priority ASC, next_attempt_at ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  UPDATE public.push_delivery_outbox o
  SET status = 'processing', locked_at = now(), locked_by = btrim(_worker_id), attempt_count = attempt_count + 1
  FROM candidates c
  WHERE o.id = c.id
  RETURNING o.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_push_delivery(_id uuid, _provider_message_id text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.push_delivery_outbox
  SET status='sent', sent_at=now(), provider_message_id=NULLIF(btrim(_provider_message_id),''), locked_at=NULL, locked_by=NULL,
      last_error_code=NULL, last_error_at=NULL
  WHERE id=_id AND status='processing';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_push_delivery(_id uuid, _error_code text, _retry_after_seconds integer DEFAULT 60)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _attempt integer;
  _max integer;
  _new_status text;
BEGIN
  IF _retry_after_seconds < 5 OR _retry_after_seconds > 86400 THEN
    RAISE EXCEPTION 'invalid_retry_delay';
  END IF;

  SELECT attempt_count,max_attempts INTO _attempt,_max
  FROM public.push_delivery_outbox
  WHERE id=_id AND status='processing'
  FOR UPDATE;

  IF NOT FOUND THEN RETURN 'not_processing'; END IF;
  _new_status := CASE WHEN _attempt >= _max THEN 'dead_letter' ELSE 'pending' END;

  UPDATE public.push_delivery_outbox
  SET status=_new_status,
      next_attempt_at=CASE WHEN _new_status='pending' THEN now()+make_interval(secs=>_retry_after_seconds) ELSE next_attempt_at END,
      locked_at=NULL, locked_by=NULL,
      last_error_code=left(COALESCE(NULLIF(btrim(_error_code),''),'unknown_error'),120),
      last_error_at=now()
  WHERE id=_id;

  RETURN _new_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.recover_stale_push_deliveries(_older_than_minutes integer DEFAULT 10)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _count integer;
BEGIN
  IF _older_than_minutes < 5 OR _older_than_minutes > 1440 THEN
    RAISE EXCEPTION 'invalid_stale_window';
  END IF;

  UPDATE public.push_delivery_outbox
  SET status=CASE WHEN attempt_count >= max_attempts THEN 'dead_letter' ELSE 'pending' END,
      next_attempt_at=now(), locked_at=NULL, locked_by=NULL,
      last_error_code='worker_timeout', last_error_at=now()
  WHERE status='processing' AND locked_at < now()-make_interval(mins=>_older_than_minutes);
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

ALTER TABLE public.push_delivery_outbox ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='push_delivery_outbox' AND policyname='push_outbox_select_own') THEN
    CREATE POLICY push_outbox_select_own ON public.push_delivery_outbox
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

REVOKE INSERT, UPDATE, DELETE ON public.push_delivery_outbox FROM anon, authenticated;
GRANT SELECT ON public.push_delivery_outbox TO authenticated;
REVOKE ALL ON FUNCTION public.touch_push_delivery_outbox_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_push_delivery(text,uuid,text,text,text,jsonb,smallint,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_push_delivery_batch(text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_push_delivery(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_push_delivery(uuid,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recover_stale_push_deliveries(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_push_delivery(text,uuid,text,text,text,jsonb,smallint,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_push_delivery_batch(text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_push_delivery(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_push_delivery(uuid,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.recover_stale_push_deliveries(integer) TO service_role;

COMMIT;
