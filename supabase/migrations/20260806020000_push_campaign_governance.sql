-- Governança segura de campanhas push administrativas.
-- Migration aditiva: não altera nem exclui notificações existentes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.push_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  event text NOT NULL,
  title text NOT NULL,
  body text,
  deep_link text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_role text,
  target_city text,
  environment text NOT NULL DEFAULT 'production',
  priority smallint NOT NULL DEFAULT 5,
  is_critical boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft',
  scheduled_at timestamptz,
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  launched_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancellation_reason text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recipient_count integer NOT NULL DEFAULT 0,
  enqueued_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.push_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.push_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outbox_id uuid REFERENCES public.push_delivery_outbox(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  skip_reason text,
  error_code text,
  enqueued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaign_name_safe') THEN
    ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaign_name_safe
      CHECK (char_length(btrim(name)) BETWEEN 3 AND 120);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaign_event_safe') THEN
    ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaign_event_safe
      CHECK (event ~ '^[a-z0-9_.-]{3,80}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaign_title_safe') THEN
    ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaign_title_safe
      CHECK (char_length(btrim(title)) BETWEEN 1 AND 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaign_body_safe') THEN
    ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaign_body_safe
      CHECK (body IS NULL OR char_length(body) <= 500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaign_link_safe') THEN
    ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaign_link_safe
      CHECK (deep_link IS NULL OR (char_length(deep_link) <= 500 AND (deep_link LIKE '/#/%' OR deep_link LIKE 'apois://%')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaign_data_safe') THEN
    ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaign_data_safe
      CHECK (jsonb_typeof(data)='object' AND pg_column_size(data) <= 8192);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaign_role_safe') THEN
    ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaign_role_safe
      CHECK (target_role IS NULL OR target_role IN ('passageiro','motorista','admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaign_environment_safe') THEN
    ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaign_environment_safe
      CHECK (environment IN ('development','staging','production'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaign_priority_safe') THEN
    ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaign_priority_safe
      CHECK (priority BETWEEN 1 AND 9);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaign_status_safe') THEN
    ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaign_status_safe
      CHECK (status IN ('draft','pending_approval','approved','scheduled','launching','completed','cancelled','failed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaign_counts_safe') THEN
    ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaign_counts_safe
      CHECK (recipient_count >= 0 AND enqueued_count >= 0 AND skipped_count >= 0 AND failed_count >= 0
        AND enqueued_count + skipped_count + failed_count <= recipient_count);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaign_request_id_safe') THEN
    ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaign_request_id_safe
      CHECK (request_id IS NULL OR request_id ~ '^[A-Za-z0-9_-]{8,80}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaign_approval_consistent') THEN
    ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaign_approval_consistent
      CHECK ((approved_at IS NULL) = (approved_by IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaign_cancel_consistent') THEN
    ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaign_cancel_consistent
      CHECK ((cancelled_at IS NULL) = (cancelled_by IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaign_schedule_safe') THEN
    ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaign_schedule_safe
      CHECK (scheduled_at IS NULL OR scheduled_at >= created_at);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaign_recipient_status_safe') THEN
    ALTER TABLE public.push_campaign_recipients ADD CONSTRAINT push_campaign_recipient_status_safe
      CHECK (status IN ('pending','enqueued','skipped','failed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaign_recipient_skip_safe') THEN
    ALTER TABLE public.push_campaign_recipients ADD CONSTRAINT push_campaign_recipient_skip_safe
      CHECK ((status='skipped') = (skip_reason IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_campaign_recipient_error_safe') THEN
    ALTER TABLE public.push_campaign_recipients ADD CONSTRAINT push_campaign_recipient_error_safe
      CHECK (error_code IS NULL OR char_length(error_code) <= 160);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_push_campaign_recipient
  ON public.push_campaign_recipients(campaign_id,user_id);
CREATE INDEX IF NOT EXISTS ix_push_campaign_status_schedule
  ON public.push_campaigns(status,scheduled_at,created_at);
CREATE INDEX IF NOT EXISTS ix_push_campaign_creator
  ON public.push_campaigns(created_by,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_push_campaign_approver
  ON public.push_campaigns(approved_by,approved_at DESC)
  WHERE approved_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_push_campaign_environment
  ON public.push_campaigns(environment,status,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_push_campaign_request_id
  ON public.push_campaigns(request_id)
  WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_push_campaign_recipient_pending
  ON public.push_campaign_recipients(campaign_id,created_at)
  WHERE status='pending';
CREATE INDEX IF NOT EXISTS ix_push_campaign_recipient_outbox
  ON public.push_campaign_recipients(outbox_id)
  WHERE outbox_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_push_campaign_recipient_user
  ON public.push_campaign_recipients(user_id,created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_push_campaign_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=public
AS $$
BEGIN
  NEW.updated_at:=now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_push_campaign_updated_at ON public.push_campaigns;
CREATE TRIGGER trg_touch_push_campaign_updated_at
BEFORE UPDATE ON public.push_campaigns
FOR EACH ROW EXECUTE FUNCTION public.touch_push_campaign_updated_at();

DROP TRIGGER IF EXISTS trg_touch_push_campaign_recipient_updated_at ON public.push_campaign_recipients;
CREATE TRIGGER trg_touch_push_campaign_recipient_updated_at
BEFORE UPDATE ON public.push_campaign_recipients
FOR EACH ROW EXECUTE FUNCTION public.touch_push_campaign_updated_at();

CREATE OR REPLACE FUNCTION public.create_push_campaign(
  _name text,
  _event text,
  _title text,
  _body text DEFAULT NULL,
  _deep_link text DEFAULT NULL,
  _data jsonb DEFAULT '{}'::jsonb,
  _target_role text DEFAULT NULL,
  _target_city text DEFAULT NULL,
  _environment text DEFAULT 'production',
  _priority smallint DEFAULT 5,
  _is_critical boolean DEFAULT false,
  _scheduled_at timestamptz DEFAULT NULL,
  _request_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  _uid uuid:=auth.uid();
  _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_uid AND role IN ('admin','super_admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF _event !~ '^[a-z0-9_.-]{3,80}$' THEN RAISE EXCEPTION 'invalid_event' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.push_event_catalog WHERE event=_event AND enabled=true) THEN
    RAISE EXCEPTION 'event_not_enabled' USING ERRCODE='22023';
  END IF;
  IF _data IS NULL OR jsonb_typeof(_data)<>'object' OR pg_column_size(_data)>8192 OR jsonb_object_length(_data)>30 THEN
    RAISE EXCEPTION 'invalid_data' USING ERRCODE='22023';
  END IF;
  IF _scheduled_at IS NOT NULL AND _scheduled_at < now()-interval '5 minutes' THEN
    RAISE EXCEPTION 'invalid_schedule' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.push_campaigns(name,event,title,body,deep_link,data,target_role,target_city,environment,priority,is_critical,scheduled_at,created_by,request_id)
  VALUES(btrim(_name),lower(btrim(_event)),btrim(_title),NULLIF(btrim(_body),''),NULLIF(btrim(_deep_link),''),_data,
    NULLIF(btrim(_target_role),''),NULLIF(btrim(_target_city),''),lower(btrim(_environment)),_priority,COALESCE(_is_critical,false),_scheduled_at,_uid,NULLIF(btrim(_request_id),''))
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_push_campaign_for_approval(_campaign_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE _uid uuid:=auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  UPDATE public.push_campaigns
     SET status='pending_approval'
   WHERE id=_campaign_id AND created_by=_uid AND status='draft';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_push_campaign(_campaign_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE _uid uuid:=auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_uid AND role='super_admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  UPDATE public.push_campaigns
     SET status=CASE WHEN scheduled_at IS NULL OR scheduled_at<=now() THEN 'approved' ELSE 'scheduled' END,
         approved_at=now(), approved_by=_uid
   WHERE id=_campaign_id AND status='pending_approval' AND created_by<>_uid;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_push_campaign(_campaign_id uuid,_reason text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE _uid uuid:=auth.uid();
DECLARE _reason_clean text:=btrim(_reason);
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  IF char_length(_reason_clean) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'invalid_reason' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_uid AND role IN ('admin','super_admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  UPDATE public.push_campaigns
     SET status='cancelled',cancelled_at=now(),cancelled_by=_uid,cancellation_reason=_reason_clean
   WHERE id=_campaign_id AND status IN ('draft','pending_approval','approved','scheduled');
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_push_campaign_recipients(_campaign_id uuid,_user_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE _count integer;
BEGIN
  IF _user_ids IS NULL OR cardinality(_user_ids) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'invalid_recipients' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.push_campaigns WHERE id=_campaign_id AND status IN ('draft','approved','scheduled')) THEN
    RAISE EXCEPTION 'campaign_not_mutable' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.push_campaign_recipients(campaign_id,user_id)
  SELECT _campaign_id,u FROM unnest(_user_ids) AS u
  WHERE EXISTS (SELECT 1 FROM auth.users au WHERE au.id=u)
  ON CONFLICT (campaign_id,user_id) DO NOTHING;
  GET DIAGNOSTICS _count=ROW_COUNT;
  UPDATE public.push_campaigns c
     SET recipient_count=(SELECT count(*) FROM public.push_campaign_recipients r WHERE r.campaign_id=c.id)
   WHERE c.id=_campaign_id;
  RETURN _count;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_push_campaign_batch(_campaign_id uuid,_limit integer DEFAULT 100)
RETURNS SETOF public.push_campaign_recipients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  IF _limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid_limit' USING ERRCODE='22023'; END IF;
  UPDATE public.push_campaigns
     SET status='launching',launched_at=COALESCE(launched_at,now())
   WHERE id=_campaign_id AND status IN ('approved','scheduled') AND (scheduled_at IS NULL OR scheduled_at<=now());
  IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM public.push_campaigns WHERE id=_campaign_id AND status='launching') THEN
    RAISE EXCEPTION 'campaign_not_launchable' USING ERRCODE='22023';
  END IF;

  RETURN QUERY
  SELECT r.*
  FROM public.push_campaign_recipients r
  WHERE r.campaign_id=_campaign_id AND r.status='pending'
  ORDER BY r.created_at,r.id
  FOR UPDATE SKIP LOCKED
  LIMIT _limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_push_campaign_recipient(
  _recipient_id uuid,
  _status text,
  _outbox_id uuid DEFAULT NULL,
  _reason text DEFAULT NULL,
  _error_code text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE _campaign_id uuid;
BEGIN
  IF _status NOT IN ('enqueued','skipped','failed') THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE='22023'; END IF;
  IF _status='enqueued' AND _outbox_id IS NULL THEN RAISE EXCEPTION 'outbox_required' USING ERRCODE='22023'; END IF;
  IF _status='skipped' AND NULLIF(btrim(_reason),'') IS NULL THEN RAISE EXCEPTION 'reason_required' USING ERRCODE='22023'; END IF;

  UPDATE public.push_campaign_recipients
     SET status=_status,
         outbox_id=CASE WHEN _status='enqueued' THEN _outbox_id ELSE outbox_id END,
         skip_reason=CASE WHEN _status='skipped' THEN left(btrim(_reason),300) ELSE NULL END,
         error_code=CASE WHEN _status='failed' THEN left(COALESCE(NULLIF(btrim(_error_code),''),'unknown_error'),160) ELSE NULL END,
         enqueued_at=CASE WHEN _status='enqueued' THEN now() ELSE enqueued_at END
   WHERE id=_recipient_id AND status='pending'
   RETURNING campaign_id INTO _campaign_id;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.push_campaigns c
     SET enqueued_count=(SELECT count(*) FROM public.push_campaign_recipients r WHERE r.campaign_id=c.id AND r.status='enqueued'),
         skipped_count=(SELECT count(*) FROM public.push_campaign_recipients r WHERE r.campaign_id=c.id AND r.status='skipped'),
         failed_count=(SELECT count(*) FROM public.push_campaign_recipients r WHERE r.campaign_id=c.id AND r.status='failed')
   WHERE c.id=_campaign_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_push_campaign(_campaign_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE _pending integer;
DECLARE _failed integer;
DECLARE _new_status text;
BEGIN
  SELECT count(*) FILTER (WHERE status='pending'),count(*) FILTER (WHERE status='failed')
    INTO _pending,_failed
  FROM public.push_campaign_recipients WHERE campaign_id=_campaign_id;
  IF _pending>0 THEN RETURN 'incomplete'; END IF;
  _new_status:=CASE WHEN _failed>0 THEN 'failed' ELSE 'completed' END;
  UPDATE public.push_campaigns SET status=_new_status,completed_at=now() WHERE id=_campaign_id AND status='launching';
  RETURN CASE WHEN FOUND THEN _new_status ELSE 'not_launching' END;
END;
$$;

ALTER TABLE public.push_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_campaign_recipients ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='push_campaigns' AND policyname='push_campaigns_admin_select') THEN
    CREATE POLICY push_campaigns_admin_select ON public.push_campaigns FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.role IN ('admin','super_admin')));
  END IF;
END $$;

REVOKE INSERT,UPDATE,DELETE ON public.push_campaigns FROM anon,authenticated;
REVOKE ALL ON public.push_campaign_recipients FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.push_campaigns TO authenticated;

REVOKE ALL ON FUNCTION public.touch_push_campaign_updated_at() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_push_campaign(text,text,text,text,text,jsonb,text,text,text,smallint,boolean,timestamptz,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.submit_push_campaign_for_approval(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.approve_push_campaign(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.cancel_push_campaign(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.add_push_campaign_recipients(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_push_campaign_batch(uuid,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.mark_push_campaign_recipient(uuid,text,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finalize_push_campaign(uuid) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.create_push_campaign(text,text,text,text,text,jsonb,text,text,text,smallint,boolean,timestamptz,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_push_campaign_for_approval(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_push_campaign(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_push_campaign(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_push_campaign_recipients(uuid,uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_push_campaign_batch(uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_push_campaign_recipient(uuid,text,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_push_campaign(uuid) TO service_role;

COMMIT;
