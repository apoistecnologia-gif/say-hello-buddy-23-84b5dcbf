-- Push canary devices, diagnostic runs and bounded production verification.
-- Additive migration: no existing tokens, notifications or receipts are modified.

BEGIN;

CREATE TABLE IF NOT EXISTS public.push_canary_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_id uuid REFERENCES public.user_notification_tokens(id) ON DELETE SET NULL,
  device_id text NOT NULL,
  app_role text NOT NULL,
  platform text NOT NULL,
  environment text NOT NULL DEFAULT 'production',
  label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  receive_critical_only boolean NOT NULL DEFAULT false,
  last_probe_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  consecutive_failures integer NOT NULL DEFAULT 0,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.push_diagnostic_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_key text NOT NULL,
  initiated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  environment text NOT NULL DEFAULT 'production',
  scope text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  total_targets integer NOT NULL DEFAULT 0,
  queued_targets integer NOT NULL DEFAULT 0,
  delivered_targets integer NOT NULL DEFAULT 0,
  failed_targets integer NOT NULL DEFAULT 0,
  skipped_targets integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  finished_at timestamptz,
  timeout_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  request_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.push_diagnostic_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.push_diagnostic_runs(id) ON DELETE CASCADE,
  canary_id uuid NOT NULL REFERENCES public.push_canary_devices(id) ON DELETE CASCADE,
  outbox_id uuid REFERENCES public.push_delivery_outbox(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  latency_ms integer,
  provider_message_id text,
  error_code text,
  attempted_at timestamptz,
  delivered_at timestamptz,
  receipt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_canary_device_id_safe') THEN
    ALTER TABLE public.push_canary_devices ADD CONSTRAINT push_canary_device_id_safe
      CHECK (char_length(btrim(device_id)) BETWEEN 8 AND 200);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_canary_role_safe') THEN
    ALTER TABLE public.push_canary_devices ADD CONSTRAINT push_canary_role_safe
      CHECK (app_role IN ('passageiro','motorista','admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_canary_platform_safe') THEN
    ALTER TABLE public.push_canary_devices ADD CONSTRAINT push_canary_platform_safe
      CHECK (platform IN ('android','ios','web'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_canary_environment_safe') THEN
    ALTER TABLE public.push_canary_devices ADD CONSTRAINT push_canary_environment_safe
      CHECK (environment IN ('development','staging','production'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_canary_label_safe') THEN
    ALTER TABLE public.push_canary_devices ADD CONSTRAINT push_canary_label_safe
      CHECK (char_length(btrim(label)) BETWEEN 3 AND 120 AND label !~ '[\u0000-\u001F\u007F]');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_canary_failures_safe') THEN
    ALTER TABLE public.push_canary_devices ADD CONSTRAINT push_canary_failures_safe
      CHECK (consecutive_failures BETWEEN 0 AND 100000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_canary_error_safe') THEN
    ALTER TABLE public.push_canary_devices ADD CONSTRAINT push_canary_error_safe
      CHECK (last_error_code IS NULL OR char_length(last_error_code) <= 160);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_canary_dates_safe') THEN
    ALTER TABLE public.push_canary_devices ADD CONSTRAINT push_canary_dates_safe
      CHECK (last_success_at IS NULL OR last_probe_at IS NULL OR last_success_at <= last_probe_at + interval '5 minutes');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_diag_run_key_safe') THEN
    ALTER TABLE public.push_diagnostic_runs ADD CONSTRAINT push_diag_run_key_safe
      CHECK (char_length(btrim(run_key)) BETWEEN 8 AND 160 AND run_key ~ '^[A-Za-z0-9_.:-]+$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_diag_environment_safe') THEN
    ALTER TABLE public.push_diagnostic_runs ADD CONSTRAINT push_diag_environment_safe
      CHECK (environment IN ('development','staging','production'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_diag_scope_safe') THEN
    ALTER TABLE public.push_diagnostic_runs ADD CONSTRAINT push_diag_scope_safe
      CHECK (scope IN ('all_active','android','ios','web','passageiro','motorista','admin','single'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_diag_status_safe') THEN
    ALTER TABLE public.push_diagnostic_runs ADD CONSTRAINT push_diag_status_safe
      CHECK (status IN ('pending','running','completed','partial','failed','cancelled','timed_out'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_diag_counts_safe') THEN
    ALTER TABLE public.push_diagnostic_runs ADD CONSTRAINT push_diag_counts_safe
      CHECK (
        total_targets BETWEEN 0 AND 10000 AND queued_targets BETWEEN 0 AND 10000
        AND delivered_targets BETWEEN 0 AND 10000 AND failed_targets BETWEEN 0 AND 10000
        AND skipped_targets BETWEEN 0 AND 10000
        AND queued_targets <= total_targets
        AND delivered_targets + failed_targets + skipped_targets <= total_targets
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_diag_time_safe') THEN
    ALTER TABLE public.push_diagnostic_runs ADD CONSTRAINT push_diag_time_safe
      CHECK (finished_at IS NULL OR started_at IS NULL OR finished_at >= started_at);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_diag_timeout_safe') THEN
    ALTER TABLE public.push_diagnostic_runs ADD CONSTRAINT push_diag_timeout_safe
      CHECK (timeout_at >= created_at AND timeout_at <= created_at + interval '24 hours');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_diag_request_safe') THEN
    ALTER TABLE public.push_diagnostic_runs ADD CONSTRAINT push_diag_request_safe
      CHECK (request_id IS NULL OR request_id ~ '^[A-Za-z0-9_-]{8,80}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_diag_notes_safe') THEN
    ALTER TABLE public.push_diagnostic_runs ADD CONSTRAINT push_diag_notes_safe
      CHECK (notes IS NULL OR char_length(notes) <= 1000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_diag_result_status_safe') THEN
    ALTER TABLE public.push_diagnostic_results ADD CONSTRAINT push_diag_result_status_safe
      CHECK (status IN ('pending','queued','sent','delivered','failed','skipped','timed_out'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_diag_latency_safe') THEN
    ALTER TABLE public.push_diagnostic_results ADD CONSTRAINT push_diag_latency_safe
      CHECK (latency_ms IS NULL OR latency_ms BETWEEN 0 AND 86400000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_diag_provider_id_safe') THEN
    ALTER TABLE public.push_diagnostic_results ADD CONSTRAINT push_diag_provider_id_safe
      CHECK (provider_message_id IS NULL OR char_length(provider_message_id) <= 500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_diag_result_error_safe') THEN
    ALTER TABLE public.push_diagnostic_results ADD CONSTRAINT push_diag_result_error_safe
      CHECK (error_code IS NULL OR char_length(error_code) <= 160);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_diag_result_dates_safe') THEN
    ALTER TABLE public.push_diagnostic_results ADD CONSTRAINT push_diag_result_dates_safe
      CHECK (
        (delivered_at IS NULL OR attempted_at IS NULL OR delivered_at >= attempted_at)
        AND (receipt_at IS NULL OR delivered_at IS NULL OR receipt_at >= delivered_at)
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_push_canary_active_device
  ON public.push_canary_devices(environment,device_id,platform)
  WHERE is_active=true;
CREATE INDEX IF NOT EXISTS ix_push_canary_active_environment
  ON public.push_canary_devices(environment,app_role,platform)
  WHERE is_active=true;
CREATE INDEX IF NOT EXISTS ix_push_canary_failures
  ON public.push_canary_devices(consecutive_failures DESC,last_failure_at DESC)
  WHERE is_active=true AND consecutive_failures>0;
CREATE INDEX IF NOT EXISTS ix_push_canary_last_success
  ON public.push_canary_devices(last_success_at DESC)
  WHERE is_active=true;
CREATE UNIQUE INDEX IF NOT EXISTS ux_push_diag_run_key
  ON public.push_diagnostic_runs(run_key);
CREATE INDEX IF NOT EXISTS ix_push_diag_runs_status
  ON public.push_diagnostic_runs(status,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_push_diag_runs_environment
  ON public.push_diagnostic_runs(environment,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_push_diag_runs_timeout
  ON public.push_diagnostic_runs(timeout_at)
  WHERE status IN ('pending','running');
CREATE UNIQUE INDEX IF NOT EXISTS ux_push_diag_result_run_canary
  ON public.push_diagnostic_results(run_id,canary_id);
CREATE INDEX IF NOT EXISTS ix_push_diag_result_status
  ON public.push_diagnostic_results(run_id,status);
CREATE INDEX IF NOT EXISTS ix_push_diag_result_failed
  ON public.push_diagnostic_results(error_code,created_at DESC)
  WHERE status='failed';
CREATE INDEX IF NOT EXISTS ix_push_diag_result_latency
  ON public.push_diagnostic_results(latency_ms DESC)
  WHERE latency_ms IS NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_push_canary_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.updated_at:=now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_touch_push_canary_updated_at ON public.push_canary_devices;
CREATE TRIGGER trg_touch_push_canary_updated_at
BEFORE UPDATE ON public.push_canary_devices
FOR EACH ROW EXECUTE FUNCTION public.touch_push_canary_updated_at();

DROP TRIGGER IF EXISTS trg_touch_push_diag_runs_updated_at ON public.push_diagnostic_runs;
CREATE TRIGGER trg_touch_push_diag_runs_updated_at
BEFORE UPDATE ON public.push_diagnostic_runs
FOR EACH ROW EXECUTE FUNCTION public.touch_push_canary_updated_at();

DROP TRIGGER IF EXISTS trg_touch_push_diag_results_updated_at ON public.push_diagnostic_results;
CREATE TRIGGER trg_touch_push_diag_results_updated_at
BEFORE UPDATE ON public.push_diagnostic_results
FOR EACH ROW EXECUTE FUNCTION public.touch_push_canary_updated_at();

CREATE OR REPLACE FUNCTION public.register_push_canary(
  _user_id uuid,
  _token_id uuid,
  _device_id text,
  _app_role text,
  _platform text,
  _environment text,
  _label text,
  _critical_only boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE _id uuid;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_required' USING ERRCODE='22023'; END IF;
  IF char_length(btrim(_device_id)) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'invalid_device_id' USING ERRCODE='22023'; END IF;
  IF _app_role NOT IN ('passageiro','motorista','admin') THEN RAISE EXCEPTION 'invalid_app_role' USING ERRCODE='22023'; END IF;
  IF _platform NOT IN ('android','ios','web') THEN RAISE EXCEPTION 'invalid_platform' USING ERRCODE='22023'; END IF;
  IF _environment NOT IN ('development','staging','production') THEN RAISE EXCEPTION 'invalid_environment' USING ERRCODE='22023'; END IF;
  IF char_length(btrim(_label)) NOT BETWEEN 3 AND 120 THEN RAISE EXCEPTION 'invalid_label' USING ERRCODE='22023'; END IF;

  IF _token_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.user_notification_tokens
    WHERE id=_token_id AND user_id=_user_id AND is_active=true
  ) THEN
    RAISE EXCEPTION 'active_token_not_found' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.push_canary_devices(user_id,token_id,device_id,app_role,platform,environment,label,receive_critical_only,is_active)
  VALUES(_user_id,_token_id,btrim(_device_id),_app_role,_platform,_environment,btrim(_label),COALESCE(_critical_only,false),true)
  ON CONFLICT (environment,device_id,platform) WHERE is_active=true
  DO UPDATE SET user_id=EXCLUDED.user_id,token_id=EXCLUDED.token_id,app_role=EXCLUDED.app_role,label=EXCLUDED.label,
                receive_critical_only=EXCLUDED.receive_critical_only
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.disable_push_canary(_id uuid,_reason text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
BEGIN
  IF _id IS NULL THEN RAISE EXCEPTION 'id_required' USING ERRCODE='22023'; END IF;
  IF char_length(btrim(COALESCE(_reason,''))) NOT BETWEEN 3 AND 160 THEN RAISE EXCEPTION 'invalid_reason' USING ERRCODE='22023'; END IF;
  UPDATE public.push_canary_devices
  SET is_active=false,last_error_code=left('disabled:'||btrim(_reason),160)
  WHERE id=_id AND is_active=true;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_push_diagnostic_run(
  _run_key text,
  _initiated_by uuid,
  _environment text DEFAULT 'production',
  _scope text DEFAULT 'all_active',
  _single_canary_id uuid DEFAULT NULL,
  _request_id text DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE _run_id uuid; _targets integer;
BEGIN
  IF char_length(btrim(_run_key)) NOT BETWEEN 8 AND 160 OR btrim(_run_key) !~ '^[A-Za-z0-9_.:-]+$' THEN
    RAISE EXCEPTION 'invalid_run_key' USING ERRCODE='22023';
  END IF;
  IF _environment NOT IN ('development','staging','production') THEN RAISE EXCEPTION 'invalid_environment' USING ERRCODE='22023'; END IF;
  IF _scope NOT IN ('all_active','android','ios','web','passageiro','motorista','admin','single') THEN RAISE EXCEPTION 'invalid_scope' USING ERRCODE='22023'; END IF;
  IF _scope='single' AND _single_canary_id IS NULL THEN RAISE EXCEPTION 'single_canary_required' USING ERRCODE='22023'; END IF;
  IF _request_id IS NOT NULL AND _request_id !~ '^[A-Za-z0-9_-]{8,80}$' THEN RAISE EXCEPTION 'invalid_request_id' USING ERRCODE='22023'; END IF;
  IF _notes IS NOT NULL AND char_length(_notes)>1000 THEN RAISE EXCEPTION 'notes_too_long' USING ERRCODE='22023'; END IF;

  INSERT INTO public.push_diagnostic_runs(run_key,initiated_by,environment,scope,status,started_at,request_id,notes)
  VALUES(btrim(_run_key),_initiated_by,_environment,_scope,'running',now(),_request_id,_notes)
  ON CONFLICT (run_key) DO UPDATE SET run_key=EXCLUDED.run_key
  RETURNING id INTO _run_id;

  INSERT INTO public.push_diagnostic_results(run_id,canary_id,status)
  SELECT _run_id,c.id,'pending'
  FROM public.push_canary_devices c
  WHERE c.is_active=true AND c.environment=_environment
    AND (_scope='all_active' OR c.platform=_scope OR c.app_role=_scope OR (_scope='single' AND c.id=_single_canary_id))
  ON CONFLICT (run_id,canary_id) DO NOTHING;

  SELECT count(*) INTO _targets FROM public.push_diagnostic_results WHERE run_id=_run_id;
  UPDATE public.push_diagnostic_runs SET total_targets=_targets WHERE id=_run_id;
  RETURN _run_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_push_diagnostic_targets(_run_id uuid,_limit integer DEFAULT 20)
RETURNS SETOF public.push_diagnostic_results
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
BEGIN
  IF _limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid_limit' USING ERRCODE='22023'; END IF;
  RETURN QUERY
  WITH c AS (
    SELECT id FROM public.push_diagnostic_results
    WHERE run_id=_run_id AND status='pending'
    ORDER BY created_at,id
    FOR UPDATE SKIP LOCKED LIMIT _limit
  )
  UPDATE public.push_diagnostic_results r
  SET status='queued',attempted_at=now()
  FROM c WHERE r.id=c.id
  RETURNING r.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_push_diagnostic_target(
  _result_id uuid,
  _status text,
  _outbox_id uuid DEFAULT NULL,
  _latency_ms integer DEFAULT NULL,
  _provider_message_id text DEFAULT NULL,
  _error_code text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE _run_id uuid; _canary_id uuid;
BEGIN
  IF _status NOT IN ('sent','delivered','failed','skipped','timed_out') THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE='22023'; END IF;
  IF _latency_ms IS NOT NULL AND _latency_ms NOT BETWEEN 0 AND 86400000 THEN RAISE EXCEPTION 'invalid_latency' USING ERRCODE='22023'; END IF;
  IF _provider_message_id IS NOT NULL AND char_length(_provider_message_id)>500 THEN RAISE EXCEPTION 'provider_id_too_long' USING ERRCODE='22023'; END IF;
  IF _error_code IS NOT NULL AND char_length(_error_code)>160 THEN RAISE EXCEPTION 'error_code_too_long' USING ERRCODE='22023'; END IF;

  UPDATE public.push_diagnostic_results
  SET status=_status,outbox_id=COALESCE(_outbox_id,outbox_id),latency_ms=_latency_ms,
      provider_message_id=NULLIF(btrim(_provider_message_id),''),error_code=NULLIF(btrim(_error_code),''),
      delivered_at=CASE WHEN _status IN ('sent','delivered') THEN now() ELSE delivered_at END,
      receipt_at=CASE WHEN _status='delivered' THEN now() ELSE receipt_at END
  WHERE id=_result_id AND status IN ('pending','queued','sent')
  RETURNING run_id,canary_id INTO _run_id,_canary_id;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.push_canary_devices
  SET last_probe_at=now(),
      last_success_at=CASE WHEN _status IN ('sent','delivered') THEN now() ELSE last_success_at END,
      last_failure_at=CASE WHEN _status IN ('failed','timed_out') THEN now() ELSE last_failure_at END,
      consecutive_failures=CASE WHEN _status IN ('sent','delivered') THEN 0 WHEN _status IN ('failed','timed_out') THEN LEAST(consecutive_failures+1,100000) ELSE consecutive_failures END,
      last_error_code=CASE WHEN _status IN ('sent','delivered') THEN NULL ELSE NULLIF(btrim(_error_code),'') END
  WHERE id=_canary_id;

  UPDATE public.push_diagnostic_runs d
  SET queued_targets=(SELECT count(*) FROM public.push_diagnostic_results WHERE run_id=_run_id AND status IN ('queued','sent','delivered','failed','skipped','timed_out')),
      delivered_targets=(SELECT count(*) FROM public.push_diagnostic_results WHERE run_id=_run_id AND status='delivered'),
      failed_targets=(SELECT count(*) FROM public.push_diagnostic_results WHERE run_id=_run_id AND status IN ('failed','timed_out')),
      skipped_targets=(SELECT count(*) FROM public.push_diagnostic_results WHERE run_id=_run_id AND status='skipped')
  WHERE d.id=_run_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_push_diagnostic_run(_run_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE _pending integer; _failed integer; _delivered integer; _total integer; _status text;
BEGIN
  SELECT count(*) FILTER (WHERE status IN ('pending','queued','sent')),
         count(*) FILTER (WHERE status IN ('failed','timed_out')),
         count(*) FILTER (WHERE status='delivered'),count(*)
  INTO _pending,_failed,_delivered,_total
  FROM public.push_diagnostic_results WHERE run_id=_run_id;

  IF _pending>0 THEN RETURN 'running'; END IF;
  _status:=CASE WHEN _total=0 THEN 'failed' WHEN _failed=0 AND _delivered=_total THEN 'completed' WHEN _delivered>0 THEN 'partial' ELSE 'failed' END;
  UPDATE public.push_diagnostic_runs SET status=_status,finished_at=now() WHERE id=_run_id AND status='running';
  RETURN _status;
END;
$$;

CREATE OR REPLACE FUNCTION public.timeout_push_diagnostic_runs(_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE _count integer;
BEGIN
  IF _limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'invalid_limit' USING ERRCODE='22023'; END IF;
  WITH overdue AS (
    SELECT id FROM public.push_diagnostic_runs
    WHERE status IN ('pending','running') AND timeout_at<now()
    ORDER BY timeout_at FOR UPDATE SKIP LOCKED LIMIT _limit
  )
  UPDATE public.push_diagnostic_runs d SET status='timed_out',finished_at=now()
  FROM overdue o WHERE d.id=o.id;
  GET DIAGNOSTICS _count=ROW_COUNT;
  RETURN _count;
END;
$$;

CREATE OR REPLACE VIEW public.push_canary_health_summary
WITH (security_invoker=true) AS
SELECT environment,app_role,platform,
       count(*) FILTER (WHERE is_active) AS active_canaries,
       count(*) FILTER (WHERE is_active AND consecutive_failures>0) AS unhealthy_canaries,
       max(last_success_at) AS last_success_at,
       max(last_failure_at) AS last_failure_at,
       max(consecutive_failures) FILTER (WHERE is_active) AS max_consecutive_failures
FROM public.push_canary_devices
GROUP BY environment,app_role,platform;

ALTER TABLE public.push_canary_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_diagnostic_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_diagnostic_results ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.push_canary_devices,public.push_diagnostic_runs,public.push_diagnostic_results,public.push_canary_health_summary FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.push_canary_devices,public.push_diagnostic_runs,public.push_diagnostic_results,public.push_canary_health_summary TO service_role;

REVOKE ALL ON FUNCTION public.touch_push_canary_updated_at() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.register_push_canary(uuid,uuid,text,text,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.disable_push_canary(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.start_push_diagnostic_run(text,uuid,text,text,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_push_diagnostic_targets(uuid,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.complete_push_diagnostic_target(uuid,text,uuid,integer,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finalize_push_diagnostic_run(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.timeout_push_diagnostic_runs(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_push_canary(uuid,uuid,text,text,text,text,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.disable_push_canary(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_push_diagnostic_run(text,uuid,text,text,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_push_diagnostic_targets(uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_push_diagnostic_target(uuid,text,uuid,integer,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_push_diagnostic_run(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.timeout_push_diagnostic_runs(integer) TO service_role;

COMMIT;
