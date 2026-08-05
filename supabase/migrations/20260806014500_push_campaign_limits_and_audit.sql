-- Campaign throttling, approval expiry, dry-run controls and immutable audit trail.
-- Additive migration: no existing campaign or recipient rows are rewritten or deleted.

BEGIN;

ALTER TABLE public.push_campaigns
  ADD COLUMN IF NOT EXISTS approval_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS dry_run boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_recipients integer NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS batch_size integer NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS per_minute_limit integer NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS per_hour_limit integer NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS launch_window_start time,
  ADD COLUMN IF NOT EXISTS launch_window_end time,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Recife',
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pause_reason text,
  ADD COLUMN IF NOT EXISTS resumed_at timestamptz,
  ADD COLUMN IF NOT EXISTS resumed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stopped_at timestamptz,
  ADD COLUMN IF NOT EXISTS stopped_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stop_reason text,
  ADD COLUMN IF NOT EXISTS last_batch_at timestamptz,
  ADD COLUMN IF NOT EXISTS launched_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS throttled_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duplicate_count integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaigns_approval_expiry_safe') THEN
    ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaigns_approval_expiry_safe
      CHECK (approval_expires_at IS NULL OR approved_at IS NULL OR approval_expires_at > approved_at) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaigns_snapshot_safe') THEN
    ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaigns_snapshot_safe
      CHECK (approved_snapshot IS NULL OR (jsonb_typeof(approved_snapshot)='object' AND pg_column_size(approved_snapshot)<=16384)) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaigns_max_recipients_safe') THEN
    ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaigns_max_recipients_safe
      CHECK (max_recipients BETWEEN 1 AND 1000000) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaigns_batch_size_safe') THEN
    ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaigns_batch_size_safe
      CHECK (batch_size BETWEEN 1 AND 1000) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaigns_minute_limit_safe') THEN
    ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaigns_minute_limit_safe
      CHECK (per_minute_limit BETWEEN 1 AND 100000) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaigns_hour_limit_safe') THEN
    ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaigns_hour_limit_safe
      CHECK (per_hour_limit BETWEEN per_minute_limit AND 1000000) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaigns_timezone_safe') THEN
    ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaigns_timezone_safe
      CHECK (char_length(timezone) BETWEEN 1 AND 100) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaigns_pause_reason_safe') THEN
    ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaigns_pause_reason_safe
      CHECK (pause_reason IS NULL OR char_length(btrim(pause_reason)) BETWEEN 3 AND 500) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaigns_stop_reason_safe') THEN
    ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaigns_stop_reason_safe
      CHECK (stop_reason IS NULL OR char_length(btrim(stop_reason)) BETWEEN 3 AND 500) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaigns_pause_consistent') THEN
    ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaigns_pause_consistent
      CHECK ((paused_at IS NULL) = (paused_by IS NULL)) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaigns_stop_consistent') THEN
    ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaigns_stop_consistent
      CHECK ((stopped_at IS NULL) = (stopped_by IS NULL)) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaigns_runtime_counts_safe') THEN
    ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaigns_runtime_counts_safe
      CHECK (launched_count>=0 AND throttled_count>=0 AND duplicate_count>=0) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_push_campaigns_approval_expiry
  ON public.push_campaigns(approval_expires_at)
  WHERE approval_expires_at IS NOT NULL AND status='approved';
CREATE INDEX IF NOT EXISTS ix_push_campaigns_paused
  ON public.push_campaigns(paused_at DESC)
  WHERE paused_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_push_campaigns_stopped
  ON public.push_campaigns(stopped_at DESC)
  WHERE stopped_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_push_campaigns_last_batch
  ON public.push_campaigns(last_batch_at DESC)
  WHERE last_batch_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_push_campaigns_dry_run
  ON public.push_campaigns(created_at DESC)
  WHERE dry_run=true;

CREATE TABLE IF NOT EXISTS public.push_campaign_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.push_campaigns(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  from_status text,
  to_status text,
  request_id text,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaign_audit_action_safe') THEN
    ALTER TABLE public.push_campaign_audit_logs ADD CONSTRAINT push_campaign_audit_action_safe
      CHECK (action ~ '^[a-z0-9_.-]{3,80}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaign_audit_reason_safe') THEN
    ALTER TABLE public.push_campaign_audit_logs ADD CONSTRAINT push_campaign_audit_reason_safe
      CHECK (reason IS NULL OR char_length(reason)<=1000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaign_audit_request_safe') THEN
    ALTER TABLE public.push_campaign_audit_logs ADD CONSTRAINT push_campaign_audit_request_safe
      CHECK (request_id IS NULL OR request_id ~ '^[A-Za-z0-9_-]{8,100}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaign_audit_metadata_safe') THEN
    ALTER TABLE public.push_campaign_audit_logs ADD CONSTRAINT push_campaign_audit_metadata_safe
      CHECK (jsonb_typeof(metadata)='object' AND pg_column_size(metadata)<=16384);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_push_campaign_audit_campaign
  ON public.push_campaign_audit_logs(campaign_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_push_campaign_audit_actor
  ON public.push_campaign_audit_logs(actor_id,created_at DESC)
  WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_push_campaign_audit_action
  ON public.push_campaign_audit_logs(action,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_push_campaign_audit_request
  ON public.push_campaign_audit_logs(request_id)
  WHERE request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.audit_push_campaign_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  _action text;
BEGIN
  IF TG_OP='INSERT' THEN
    _action:='campaign.created';
    INSERT INTO public.push_campaign_audit_logs(campaign_id,actor_id,action,to_status,metadata)
    VALUES(NEW.id,NEW.created_by,_action,NEW.status,jsonb_build_object('dry_run',NEW.dry_run,'environment',NEW.environment));
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    _action:='campaign.status_changed';
    INSERT INTO public.push_campaign_audit_logs(campaign_id,actor_id,action,from_status,to_status,metadata)
    VALUES(NEW.id,COALESCE(NEW.approved_by,NEW.paused_by,NEW.resumed_by,NEW.stopped_by),_action,OLD.status,NEW.status,
      jsonb_build_object('scheduled_at',NEW.scheduled_at,'last_batch_at',NEW.last_batch_at));
  END IF;

  IF NEW.paused_at IS DISTINCT FROM OLD.paused_at AND NEW.paused_at IS NOT NULL THEN
    INSERT INTO public.push_campaign_audit_logs(campaign_id,actor_id,action,reason)
    VALUES(NEW.id,NEW.paused_by,'campaign.paused',NEW.pause_reason);
  END IF;
  IF NEW.resumed_at IS DISTINCT FROM OLD.resumed_at AND NEW.resumed_at IS NOT NULL THEN
    INSERT INTO public.push_campaign_audit_logs(campaign_id,actor_id,action)
    VALUES(NEW.id,NEW.resumed_by,'campaign.resumed');
  END IF;
  IF NEW.stopped_at IS DISTINCT FROM OLD.stopped_at AND NEW.stopped_at IS NOT NULL THEN
    INSERT INTO public.push_campaign_audit_logs(campaign_id,actor_id,action,reason)
    VALUES(NEW.id,NEW.stopped_by,'campaign.stopped',NEW.stop_reason);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_push_campaign_change ON public.push_campaigns;
CREATE TRIGGER trg_audit_push_campaign_change
AFTER INSERT OR UPDATE ON public.push_campaigns
FOR EACH ROW EXECUTE FUNCTION public.audit_push_campaign_change();

CREATE OR REPLACE FUNCTION public.pause_push_campaign(_campaign_id uuid,_reason text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE _actor uuid:=auth.uid();
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  IF char_length(btrim(_reason)) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'invalid_reason' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_actor AND role IN ('admin','super_admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  UPDATE public.push_campaigns
     SET status='paused',paused_at=now(),paused_by=_actor,pause_reason=btrim(_reason)
   WHERE id=_campaign_id AND status IN ('approved','launching','running');
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_push_campaign(_campaign_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE _actor uuid:=auth.uid();
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_actor AND role IN ('admin','super_admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  UPDATE public.push_campaigns
     SET status='approved',resumed_at=now(),resumed_by=_actor,paused_at=NULL,paused_by=NULL,pause_reason=NULL
   WHERE id=_campaign_id AND status='paused' AND (approval_expires_at IS NULL OR approval_expires_at>now());
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.stop_push_campaign(_campaign_id uuid,_reason text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE _actor uuid:=auth.uid();
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  IF char_length(btrim(_reason)) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'invalid_reason' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_actor AND role='super_admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  UPDATE public.push_campaigns
     SET status='cancelled',stopped_at=now(),stopped_by=_actor,stop_reason=btrim(_reason)
   WHERE id=_campaign_id AND status NOT IN ('completed','failed','cancelled');
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_push_campaign_approvals(_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE _count integer;
BEGIN
  IF _limit NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'invalid_limit' USING ERRCODE='22023'; END IF;
  WITH expired AS (
    SELECT id FROM public.push_campaigns
    WHERE status='approved' AND approval_expires_at IS NOT NULL AND approval_expires_at<=now()
    ORDER BY approval_expires_at
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  UPDATE public.push_campaigns c
     SET status='draft',approved_at=NULL,approved_by=NULL,approved_snapshot=NULL
    FROM expired e WHERE c.id=e.id;
  GET DIAGNOSTICS _count=ROW_COUNT;
  RETURN _count;
END;
$$;

ALTER TABLE public.push_campaign_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_campaign_audit_logs FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.push_campaign_audit_logs TO service_role;

REVOKE ALL ON FUNCTION public.audit_push_campaign_change() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pause_push_campaign(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.resume_push_campaign(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.stop_push_campaign(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.expire_push_campaign_approvals(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pause_push_campaign(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_push_campaign(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stop_push_campaign(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_push_campaign_approvals(integer) TO service_role;

COMMIT;
