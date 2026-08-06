-- Push provider health, circuit breaker and bounded operational metrics.
-- Additive migration: no existing delivery rows are rewritten or deleted.

BEGIN;

CREATE TABLE IF NOT EXISTS public.push_provider_health (
  provider text PRIMARY KEY,
  state text NOT NULL DEFAULT 'closed',
  consecutive_failures integer NOT NULL DEFAULT 0,
  consecutive_successes integer NOT NULL DEFAULT 0,
  opened_at timestamptz,
  half_open_at timestamptz,
  last_failure_at timestamptz,
  last_success_at timestamptz,
  last_error_code text,
  last_http_status integer,
  cooldown_seconds integer NOT NULL DEFAULT 60,
  failure_threshold integer NOT NULL DEFAULT 5,
  success_threshold integer NOT NULL DEFAULT 2,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_provider_health_provider_safe') THEN
    ALTER TABLE public.push_provider_health
      ADD CONSTRAINT push_provider_health_provider_safe
      CHECK (provider ~ '^[a-z0-9_.-]{2,40}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_provider_health_state_safe') THEN
    ALTER TABLE public.push_provider_health
      ADD CONSTRAINT push_provider_health_state_safe
      CHECK (state IN ('closed','open','half_open'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_provider_health_counts_safe') THEN
    ALTER TABLE public.push_provider_health
      ADD CONSTRAINT push_provider_health_counts_safe
      CHECK (consecutive_failures BETWEEN 0 AND 100000 AND consecutive_successes BETWEEN 0 AND 100000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_provider_health_thresholds_safe') THEN
    ALTER TABLE public.push_provider_health
      ADD CONSTRAINT push_provider_health_thresholds_safe
      CHECK (failure_threshold BETWEEN 1 AND 100 AND success_threshold BETWEEN 1 AND 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_provider_health_cooldown_safe') THEN
    ALTER TABLE public.push_provider_health
      ADD CONSTRAINT push_provider_health_cooldown_safe
      CHECK (cooldown_seconds BETWEEN 5 AND 86400);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_provider_health_http_safe') THEN
    ALTER TABLE public.push_provider_health
      ADD CONSTRAINT push_provider_health_http_safe
      CHECK (last_http_status IS NULL OR last_http_status BETWEEN 100 AND 599);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_provider_health_error_safe') THEN
    ALTER TABLE public.push_provider_health
      ADD CONSTRAINT push_provider_health_error_safe
      CHECK (last_error_code IS NULL OR char_length(last_error_code) <= 160);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_provider_health_open_consistent') THEN
    ALTER TABLE public.push_provider_health
      ADD CONSTRAINT push_provider_health_open_consistent
      CHECK ((state = 'open') = (opened_at IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_provider_health_half_open_consistent') THEN
    ALTER TABLE public.push_provider_health
      ADD CONSTRAINT push_provider_health_half_open_consistent
      CHECK ((state = 'half_open') = (half_open_at IS NOT NULL));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_push_provider_health_state
  ON public.push_provider_health(state, updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_push_provider_health_last_failure
  ON public.push_provider_health(last_failure_at DESC)
  WHERE last_failure_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_push_provider_health_last_success
  ON public.push_provider_health(last_success_at DESC)
  WHERE last_success_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_push_provider_health_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_push_provider_health_updated_at ON public.push_provider_health;
CREATE TRIGGER trg_touch_push_provider_health_updated_at
BEFORE UPDATE ON public.push_provider_health
FOR EACH ROW EXECUTE FUNCTION public.touch_push_provider_health_updated_at();

CREATE OR REPLACE FUNCTION public.ensure_push_provider_health(
  _provider text,
  _failure_threshold integer DEFAULT 5,
  _success_threshold integer DEFAULT 2,
  _cooldown_seconds integer DEFAULT 60
)
RETURNS public.push_provider_health
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.push_provider_health;
  _clean_provider text := lower(btrim(_provider));
BEGIN
  IF _clean_provider !~ '^[a-z0-9_.-]{2,40}$' THEN
    RAISE EXCEPTION 'invalid_provider' USING ERRCODE = '22023';
  END IF;
  IF _failure_threshold NOT BETWEEN 1 AND 100 OR _success_threshold NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_threshold' USING ERRCODE = '22023';
  END IF;
  IF _cooldown_seconds NOT BETWEEN 5 AND 86400 THEN
    RAISE EXCEPTION 'invalid_cooldown' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.push_provider_health(provider,failure_threshold,success_threshold,cooldown_seconds)
  VALUES (_clean_provider,_failure_threshold,_success_threshold,_cooldown_seconds)
  ON CONFLICT (provider) DO UPDATE
    SET failure_threshold = EXCLUDED.failure_threshold,
        success_threshold = EXCLUDED.success_threshold,
        cooldown_seconds = EXCLUDED.cooldown_seconds
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_send_push_provider(_provider text)
RETURNS TABLE(allowed boolean, state text, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.push_provider_health;
  _elapsed numeric;
BEGIN
  SELECT * INTO _row
  FROM public.push_provider_health
  WHERE provider = lower(btrim(_provider))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT true, 'closed'::text, 0;
    RETURN;
  END IF;

  IF _row.state = 'closed' THEN
    RETURN QUERY SELECT true, _row.state, 0;
    RETURN;
  END IF;

  IF _row.state = 'half_open' THEN
    RETURN QUERY SELECT true, _row.state, 0;
    RETURN;
  END IF;

  _elapsed := EXTRACT(EPOCH FROM (now() - _row.opened_at));
  IF _elapsed >= _row.cooldown_seconds THEN
    UPDATE public.push_provider_health
       SET state='half_open', half_open_at=now(), opened_at=NULL, consecutive_successes=0
     WHERE provider=_row.provider;
    RETURN QUERY SELECT true, 'half_open'::text, 0;
  ELSE
    RETURN QUERY SELECT false, 'open'::text, GREATEST(1, CEIL(_row.cooldown_seconds - _elapsed)::integer);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_push_provider_success(_provider text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.push_provider_health;
  _new_successes integer;
BEGIN
  SELECT * INTO _row
  FROM public.push_provider_health
  WHERE provider = lower(btrim(_provider))
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.ensure_push_provider_health(_provider);
    SELECT * INTO _row FROM public.push_provider_health WHERE provider=lower(btrim(_provider)) FOR UPDATE;
  END IF;

  _new_successes := LEAST(_row.consecutive_successes + 1, 100000);

  UPDATE public.push_provider_health
     SET consecutive_successes=_new_successes,
         consecutive_failures=0,
         last_success_at=now(),
         last_error_code=NULL,
         last_http_status=NULL,
         state=CASE WHEN _row.state='half_open' AND _new_successes >= _row.success_threshold THEN 'closed' ELSE _row.state END,
         opened_at=NULL,
         half_open_at=CASE WHEN _row.state='half_open' AND _new_successes < _row.success_threshold THEN _row.half_open_at ELSE NULL END
   WHERE provider=_row.provider;

  RETURN CASE WHEN _row.state='half_open' AND _new_successes >= _row.success_threshold THEN 'closed' ELSE _row.state END;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_push_provider_failure(
  _provider text,
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
  _row public.push_provider_health;
  _new_failures integer;
  _new_state text;
BEGIN
  IF _http_status IS NOT NULL AND _http_status NOT BETWEEN 100 AND 599 THEN
    RAISE EXCEPTION 'invalid_http_status' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _row
  FROM public.push_provider_health
  WHERE provider = lower(btrim(_provider))
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.ensure_push_provider_health(_provider);
    SELECT * INTO _row FROM public.push_provider_health WHERE provider=lower(btrim(_provider)) FOR UPDATE;
  END IF;

  _new_failures := LEAST(_row.consecutive_failures + 1, 100000);
  _new_state := CASE
    WHEN _permanent THEN 'open'
    WHEN _row.state='half_open' THEN 'open'
    WHEN _new_failures >= _row.failure_threshold THEN 'open'
    ELSE _row.state
  END;

  UPDATE public.push_provider_health
     SET consecutive_failures=_new_failures,
         consecutive_successes=0,
         last_failure_at=now(),
         last_error_code=left(COALESCE(NULLIF(btrim(_error_code),''),'unknown_error'),160),
         last_http_status=_http_status,
         state=_new_state,
         opened_at=CASE WHEN _new_state='open' THEN now() ELSE NULL END,
         half_open_at=NULL
   WHERE provider=_row.provider;

  RETURN _new_state;
END;
$$;

CREATE OR REPLACE VIEW public.push_delivery_health_summary
WITH (security_invoker = true)
AS
SELECT
  h.provider,
  h.state,
  h.consecutive_failures,
  h.consecutive_successes,
  h.last_failure_at,
  h.last_success_at,
  h.last_error_code,
  h.last_http_status,
  h.cooldown_seconds,
  h.updated_at,
  (SELECT count(*) FROM public.push_delivery_outbox o WHERE o.status='pending') AS pending_count,
  (SELECT count(*) FROM public.push_delivery_outbox o WHERE o.status='processing') AS processing_count,
  (SELECT count(*) FROM public.push_delivery_outbox o WHERE o.status='dead_letter') AS dead_letter_count,
  (SELECT min(o.created_at) FROM public.push_delivery_outbox o WHERE o.status='pending') AS oldest_pending_at;

ALTER TABLE public.push_provider_health ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.push_provider_health FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.push_delivery_health_summary FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.push_provider_health TO service_role;
GRANT SELECT ON public.push_delivery_health_summary TO service_role;

REVOKE ALL ON FUNCTION public.touch_push_provider_health_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_push_provider_health(text,integer,integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_send_push_provider(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_push_provider_success(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_push_provider_failure(text,text,integer,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_push_provider_health(text,integer,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_send_push_provider(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_push_provider_success(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_push_provider_failure(text,text,integer,boolean) TO service_role;

COMMIT;
