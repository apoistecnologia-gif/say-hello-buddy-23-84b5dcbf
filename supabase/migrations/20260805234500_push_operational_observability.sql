-- Additive operational observability and safe dead-letter controls for push delivery.
BEGIN;

CREATE TABLE IF NOT EXISTS public.push_delivery_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid REFERENCES public.push_delivery_outbox(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  error_code text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_incidents_event_safe') THEN
    ALTER TABLE public.push_delivery_incidents ADD CONSTRAINT push_incidents_event_safe
      CHECK (event ~ '^[a-z0-9_.-]{3,80}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_incidents_severity_safe') THEN
    ALTER TABLE public.push_delivery_incidents ADD CONSTRAINT push_incidents_severity_safe
      CHECK (severity IN ('info','warning','critical'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_incidents_error_code_safe') THEN
    ALTER TABLE public.push_delivery_incidents ADD CONSTRAINT push_incidents_error_code_safe
      CHECK (error_code IS NULL OR char_length(error_code) BETWEEN 1 AND 120);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_incidents_details_object') THEN
    ALTER TABLE public.push_delivery_incidents ADD CONSTRAINT push_incidents_details_object
      CHECK (jsonb_typeof(details) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_incidents_request_id_safe') THEN
    ALTER TABLE public.push_delivery_incidents ADD CONSTRAINT push_incidents_request_id_safe
      CHECK (request_id IS NULL OR char_length(request_id) BETWEEN 8 AND 80);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_incidents_resolution_consistent') THEN
    ALTER TABLE public.push_delivery_incidents ADD CONSTRAINT push_incidents_resolution_consistent
      CHECK ((resolved_at IS NULL AND resolved_by IS NULL) OR (resolved_at IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_incidents_resolution_note_safe') THEN
    ALTER TABLE public.push_delivery_incidents ADD CONSTRAINT push_incidents_resolution_note_safe
      CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 1000);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_push_incidents_open_severity
  ON public.push_delivery_incidents(severity, detected_at DESC)
  WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_push_incidents_outbox
  ON public.push_delivery_incidents(outbox_id, detected_at DESC)
  WHERE outbox_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_push_incidents_user
  ON public.push_delivery_incidents(user_id, detected_at DESC)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_push_incidents_error
  ON public.push_delivery_incidents(error_code, detected_at DESC)
  WHERE error_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_push_incidents_request
  ON public.push_delivery_incidents(request_id)
  WHERE request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_push_delivery_incidents_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_push_delivery_incidents_updated_at ON public.push_delivery_incidents;
CREATE TRIGGER trg_touch_push_delivery_incidents_updated_at
BEFORE UPDATE ON public.push_delivery_incidents
FOR EACH ROW EXECUTE FUNCTION public.touch_push_delivery_incidents_updated_at();

CREATE OR REPLACE FUNCTION public.record_push_delivery_incident(
  _outbox_id uuid,
  _severity text,
  _error_code text DEFAULT NULL,
  _details jsonb DEFAULT '{}'::jsonb,
  _request_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _outbox public.push_delivery_outbox%ROWTYPE;
  _incident_id uuid;
BEGIN
  SELECT * INTO _outbox FROM public.push_delivery_outbox WHERE id = _outbox_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'outbox_not_found'; END IF;
  IF _severity NOT IN ('info','warning','critical') THEN RAISE EXCEPTION 'invalid_severity'; END IF;
  IF _details IS NULL OR jsonb_typeof(_details) <> 'object' THEN RAISE EXCEPTION 'invalid_details'; END IF;

  INSERT INTO public.push_delivery_incidents(outbox_id,user_id,event,severity,error_code,details,request_id)
  VALUES (
    _outbox.id,
    _outbox.user_id,
    _outbox.event,
    _severity,
    left(NULLIF(btrim(_error_code),''),120),
    _details,
    left(NULLIF(btrim(_request_id),''),80)
  )
  RETURNING id INTO _incident_id;

  RETURN _incident_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_push_delivery_incident(
  _incident_id uuid,
  _resolved_by uuid,
  _resolution_note text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _resolved_by IS NULL THEN RAISE EXCEPTION 'resolver_required'; END IF;
  IF _resolution_note IS NULL OR char_length(btrim(_resolution_note)) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'invalid_resolution_note';
  END IF;

  UPDATE public.push_delivery_incidents
  SET resolved_at = now(), resolved_by = _resolved_by, resolution_note = btrim(_resolution_note)
  WHERE id = _incident_id AND resolved_at IS NULL;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.requeue_dead_letter_push(
  _outbox_id uuid,
  _requested_by uuid,
  _reason text,
  _delay_seconds integer DEFAULT 30
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _requested_by IS NULL THEN RAISE EXCEPTION 'requester_required'; END IF;
  IF _reason IS NULL OR char_length(btrim(_reason)) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'invalid_reason'; END IF;
  IF _delay_seconds < 5 OR _delay_seconds > 86400 THEN RAISE EXCEPTION 'invalid_delay'; END IF;

  UPDATE public.push_delivery_outbox
  SET status='pending',
      attempt_count=0,
      next_attempt_at=now()+make_interval(secs=>_delay_seconds),
      locked_at=NULL,
      locked_by=NULL,
      last_error_code=NULL,
      last_error_at=NULL,
      sent_at=NULL,
      provider_message_id=NULL
  WHERE id=_outbox_id AND status='dead_letter';

  IF FOUND THEN
    INSERT INTO public.push_delivery_incidents(outbox_id,user_id,event,severity,error_code,details,resolved_at,resolved_by,resolution_note)
    SELECT id,user_id,event,'info','dead_letter_requeued',jsonb_build_object('delay_seconds',_delay_seconds),now(),_requested_by,btrim(_reason)
    FROM public.push_delivery_outbox WHERE id=_outbox_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE VIEW public.push_delivery_health_summary
WITH (security_invoker = true)
AS
SELECT
  count(*) FILTER (WHERE status='pending') AS pending,
  count(*) FILTER (WHERE status='processing') AS processing,
  count(*) FILTER (WHERE status='sent') AS sent,
  count(*) FILTER (WHERE status='failed') AS failed,
  count(*) FILTER (WHERE status='dead_letter') AS dead_letter,
  count(*) FILTER (WHERE status='processing' AND locked_at < now()-interval '10 minutes') AS stale_processing,
  count(*) FILTER (WHERE status='pending' AND next_attempt_at < now()-interval '5 minutes') AS overdue_pending,
  min(next_attempt_at) FILTER (WHERE status='pending') AS oldest_pending_due_at,
  max(sent_at) FILTER (WHERE status='sent') AS last_sent_at,
  max(last_error_at) FILTER (WHERE last_error_at IS NOT NULL) AS last_error_at
FROM public.push_delivery_outbox;

ALTER TABLE public.push_delivery_incidents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.push_delivery_incidents FROM anon, authenticated;
REVOKE ALL ON public.push_delivery_health_summary FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_delivery_incidents TO service_role;
GRANT SELECT ON public.push_delivery_health_summary TO service_role;

REVOKE ALL ON FUNCTION public.touch_push_delivery_incidents_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_push_delivery_incident(uuid,text,text,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_push_delivery_incident(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.requeue_dead_letter_push(uuid,uuid,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_push_delivery_incident(uuid,text,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_push_delivery_incident(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.requeue_dead_letter_push(uuid,uuid,text,integer) TO service_role;

COMMIT;
