-- Immutable release-gate snapshots for the APOIS push subsystem.
-- Additive only: no operational notification data is changed.

BEGIN;

CREATE TABLE IF NOT EXISTS public.push_release_gate_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  request_id text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  total_checks integer NOT NULL DEFAULT 0,
  passed_checks integer NOT NULL DEFAULT 0,
  failed_checks integer NOT NULL DEFAULT 0,
  critical_failures integer NOT NULL DEFAULT 0,
  high_failures integer NOT NULL DEFAULT 0,
  readiness_percent numeric(5,2) NOT NULL DEFAULT 0,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  approval_note text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.push_release_gate_results (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.push_release_gate_runs(id) ON DELETE CASCADE,
  category text NOT NULL,
  check_name text NOT NULL,
  passed boolean NOT NULL,
  severity text NOT NULL,
  details text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id, check_name)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_release_gate_environment_safe') THEN
    ALTER TABLE public.push_release_gate_runs ADD CONSTRAINT push_release_gate_environment_safe
      CHECK (environment IN ('development','staging','production'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_release_gate_status_safe') THEN
    ALTER TABLE public.push_release_gate_runs ADD CONSTRAINT push_release_gate_status_safe
      CHECK (status IN ('running','blocked','ready','approved','expired'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_release_gate_request_safe') THEN
    ALTER TABLE public.push_release_gate_runs ADD CONSTRAINT push_release_gate_request_safe
      CHECK (request_id ~ '^[A-Za-z0-9_-]{8,100}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_release_gate_counts_safe') THEN
    ALTER TABLE public.push_release_gate_runs ADD CONSTRAINT push_release_gate_counts_safe
      CHECK (
        total_checks >= 0 AND passed_checks >= 0 AND failed_checks >= 0
        AND critical_failures >= 0 AND high_failures >= 0
        AND passed_checks + failed_checks = total_checks
        AND critical_failures <= failed_checks AND high_failures <= failed_checks
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_release_gate_percent_safe') THEN
    ALTER TABLE public.push_release_gate_runs ADD CONSTRAINT push_release_gate_percent_safe
      CHECK (readiness_percent BETWEEN 0 AND 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_release_gate_time_safe') THEN
    ALTER TABLE public.push_release_gate_runs ADD CONSTRAINT push_release_gate_time_safe
      CHECK (
        finished_at IS NULL OR finished_at >= started_at
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_release_gate_expiry_safe') THEN
    ALTER TABLE public.push_release_gate_runs ADD CONSTRAINT push_release_gate_expiry_safe
      CHECK (expires_at > started_at AND expires_at <= started_at + interval '7 days');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_release_gate_approval_safe') THEN
    ALTER TABLE public.push_release_gate_runs ADD CONSTRAINT push_release_gate_approval_safe
      CHECK (
        (status='approved') = (approved_by IS NOT NULL AND approved_at IS NOT NULL)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_release_gate_note_safe') THEN
    ALTER TABLE public.push_release_gate_runs ADD CONSTRAINT push_release_gate_note_safe
      CHECK (approval_note IS NULL OR char_length(btrim(approval_note)) BETWEEN 3 AND 500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_release_result_category_safe') THEN
    ALTER TABLE public.push_release_gate_results ADD CONSTRAINT push_release_result_category_safe
      CHECK (category ~ '^[a-z0-9_.-]{2,60}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_release_result_name_safe') THEN
    ALTER TABLE public.push_release_gate_results ADD CONSTRAINT push_release_result_name_safe
      CHECK (check_name ~ '^[a-z0-9_.-]{3,120}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_release_result_severity_safe') THEN
    ALTER TABLE public.push_release_gate_results ADD CONSTRAINT push_release_result_severity_safe
      CHECK (severity IN ('critical','high','medium','low'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_release_result_details_safe') THEN
    ALTER TABLE public.push_release_gate_results ADD CONSTRAINT push_release_result_details_safe
      CHECK (char_length(details) BETWEEN 1 AND 1000);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_push_release_gate_request
  ON public.push_release_gate_runs(environment, request_id);
CREATE INDEX IF NOT EXISTS ix_push_release_gate_status_created
  ON public.push_release_gate_runs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_push_release_gate_environment_created
  ON public.push_release_gate_runs(environment, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_push_release_gate_expiry
  ON public.push_release_gate_runs(expires_at)
  WHERE status IN ('ready','approved');
CREATE INDEX IF NOT EXISTS ix_push_release_gate_failures
  ON public.push_release_gate_runs(critical_failures DESC, high_failures DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_push_release_results_run_failed
  ON public.push_release_gate_results(run_id, severity, check_name)
  WHERE passed=false;
CREATE INDEX IF NOT EXISTS ix_push_release_results_check
  ON public.push_release_gate_results(check_name, recorded_at DESC);

CREATE OR REPLACE FUNCTION public.run_push_release_gate(
  _environment text,
  _request_id text,
  _valid_hours integer DEFAULT 24
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_catalog
AS $$
DECLARE
  _run_id uuid;
  _environment_clean text:=lower(btrim(_environment));
  _request_clean text:=btrim(_request_id);
  _summary record;
BEGIN
  IF auth.role()<>'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501';
  END IF;
  IF _environment_clean NOT IN ('development','staging','production') THEN
    RAISE EXCEPTION 'invalid_environment' USING ERRCODE='22023';
  END IF;
  IF _request_clean !~ '^[A-Za-z0-9_-]{8,100}$' THEN
    RAISE EXCEPTION 'invalid_request_id' USING ERRCODE='22023';
  END IF;
  IF _valid_hours NOT BETWEEN 1 AND 168 THEN
    RAISE EXCEPTION 'invalid_validity' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.push_release_gate_runs(environment,requested_by,request_id,expires_at)
  VALUES(_environment_clean,auth.uid(),_request_clean,now()+make_interval(hours=>_valid_hours))
  ON CONFLICT(environment,request_id) DO UPDATE SET request_id=EXCLUDED.request_id
  RETURNING id INTO _run_id;

  IF EXISTS (SELECT 1 FROM public.push_release_gate_results WHERE run_id=_run_id) THEN
    RETURN _run_id;
  END IF;

  INSERT INTO public.push_release_gate_results(run_id,category,check_name,passed,severity,details)
  SELECT _run_id,category,check_name,passed,severity,left(details,1000)
  FROM public.push_production_readiness_report();

  SELECT
    count(*)::integer AS total_checks,
    count(*) FILTER (WHERE passed)::integer AS passed_checks,
    count(*) FILTER (WHERE NOT passed)::integer AS failed_checks,
    count(*) FILTER (WHERE NOT passed AND severity='critical')::integer AS critical_failures,
    count(*) FILTER (WHERE NOT passed AND severity='high')::integer AS high_failures
  INTO _summary
  FROM public.push_release_gate_results
  WHERE run_id=_run_id;

  UPDATE public.push_release_gate_runs
  SET total_checks=_summary.total_checks,
      passed_checks=_summary.passed_checks,
      failed_checks=_summary.failed_checks,
      critical_failures=_summary.critical_failures,
      high_failures=_summary.high_failures,
      readiness_percent=round(100.0*_summary.passed_checks/NULLIF(_summary.total_checks,0),2),
      status=CASE
        WHEN _summary.critical_failures>0 OR _summary.high_failures>0 THEN 'blocked'
        ELSE 'ready'
      END,
      finished_at=now()
  WHERE id=_run_id;

  RETURN _run_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_push_release_gate(
  _run_id uuid,
  _note text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_catalog
AS $$
DECLARE
  _is_super_admin boolean;
  _note_clean text:=btrim(_note);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
  END IF;
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles
    WHERE user_id=auth.uid() AND role='super_admin'
  ) INTO _is_super_admin;
  IF NOT _is_super_admin THEN
    RAISE EXCEPTION 'super_admin_required' USING ERRCODE='42501';
  END IF;
  IF char_length(_note_clean) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'invalid_note' USING ERRCODE='22023';
  END IF;

  UPDATE public.push_release_gate_runs
  SET status='approved', approved_by=auth.uid(), approved_at=now(), approval_note=_note_clean
  WHERE id=_run_id
    AND status='ready'
    AND critical_failures=0
    AND high_failures=0
    AND expires_at>now();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_push_release_gates(_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_catalog
AS $$
DECLARE _count integer;
BEGIN
  IF auth.role()<>'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501';
  END IF;
  IF _limit NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'invalid_limit' USING ERRCODE='22023';
  END IF;
  WITH targets AS (
    SELECT id FROM public.push_release_gate_runs
    WHERE status IN ('ready','approved') AND expires_at<=now()
    ORDER BY expires_at
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  UPDATE public.push_release_gate_runs r
  SET status='expired'
  FROM targets t
  WHERE r.id=t.id;
  GET DIAGNOSTICS _count=ROW_COUNT;
  RETURN _count;
END;
$$;

CREATE OR REPLACE VIEW public.push_latest_release_gate
WITH (security_invoker=true)
AS
SELECT DISTINCT ON (environment)
  id,environment,status,total_checks,passed_checks,failed_checks,
  critical_failures,high_failures,readiness_percent,
  started_at,finished_at,expires_at,approved_at
FROM public.push_release_gate_runs
ORDER BY environment,created_at DESC;

ALTER TABLE public.push_release_gate_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_release_gate_results ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.push_release_gate_runs FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.push_release_gate_results FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.push_latest_release_gate FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.push_release_gate_runs TO service_role;
GRANT SELECT ON public.push_release_gate_results TO service_role;
GRANT SELECT ON public.push_latest_release_gate TO service_role;

REVOKE ALL ON FUNCTION public.run_push_release_gate(text,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.approve_push_release_gate(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.expire_push_release_gates(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.run_push_release_gate(text,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_push_release_gate(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_push_release_gates(integer) TO service_role;

COMMIT;
