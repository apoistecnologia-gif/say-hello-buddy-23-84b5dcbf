-- Secure in-app notification inbox, read receipts and bounded retention.
-- Additive migration: no existing notification rows are rewritten or deleted.

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_notification_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outbox_id uuid REFERENCES public.push_delivery_outbox(id) ON DELETE SET NULL,
  event text NOT NULL,
  title text NOT NULL,
  body text,
  deep_link text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority smallint NOT NULL DEFAULT 5,
  is_critical boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  opened_at timestamptz,
  archived_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_inbox_event_safe') THEN
    ALTER TABLE public.user_notification_inbox
      ADD CONSTRAINT notification_inbox_event_safe
      CHECK (event ~ '^[a-z0-9_.-]{3,80}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_inbox_title_safe') THEN
    ALTER TABLE public.user_notification_inbox
      ADD CONSTRAINT notification_inbox_title_safe
      CHECK (char_length(btrim(title)) BETWEEN 1 AND 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_inbox_body_safe') THEN
    ALTER TABLE public.user_notification_inbox
      ADD CONSTRAINT notification_inbox_body_safe
      CHECK (body IS NULL OR char_length(body) <= 500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_inbox_deep_link_safe') THEN
    ALTER TABLE public.user_notification_inbox
      ADD CONSTRAINT notification_inbox_deep_link_safe
      CHECK (
        deep_link IS NULL OR (
          char_length(deep_link) BETWEEN 1 AND 500
          AND deep_link !~ '[\u0000-\u001F\u007F]'
          AND (
            deep_link LIKE '/#/%'
            OR deep_link LIKE 'apois://%'
          )
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_inbox_data_object_safe') THEN
    ALTER TABLE public.user_notification_inbox
      ADD CONSTRAINT notification_inbox_data_object_safe
      CHECK (jsonb_typeof(data)='object' AND pg_column_size(data) <= 8192);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_inbox_priority_safe') THEN
    ALTER TABLE public.user_notification_inbox
      ADD CONSTRAINT notification_inbox_priority_safe
      CHECK (priority BETWEEN 1 AND 9);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_inbox_read_consistent') THEN
    ALTER TABLE public.user_notification_inbox
      ADD CONSTRAINT notification_inbox_read_consistent
      CHECK (opened_at IS NULL OR read_at IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_inbox_opened_time_safe') THEN
    ALTER TABLE public.user_notification_inbox
      ADD CONSTRAINT notification_inbox_opened_time_safe
      CHECK (opened_at IS NULL OR opened_at >= created_at);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_inbox_read_time_safe') THEN
    ALTER TABLE public.user_notification_inbox
      ADD CONSTRAINT notification_inbox_read_time_safe
      CHECK (read_at IS NULL OR read_at >= created_at);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_inbox_archive_time_safe') THEN
    ALTER TABLE public.user_notification_inbox
      ADD CONSTRAINT notification_inbox_archive_time_safe
      CHECK (archived_at IS NULL OR archived_at >= created_at);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_inbox_expiry_safe') THEN
    ALTER TABLE public.user_notification_inbox
      ADD CONSTRAINT notification_inbox_expiry_safe
      CHECK (expires_at IS NULL OR expires_at >= created_at);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_notification_inbox_user_outbox
  ON public.user_notification_inbox(user_id,outbox_id)
  WHERE outbox_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_notification_inbox_user_created
  ON public.user_notification_inbox(user_id,created_at DESC);

CREATE INDEX IF NOT EXISTS ix_notification_inbox_user_unread
  ON public.user_notification_inbox(user_id,created_at DESC)
  WHERE read_at IS NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_notification_inbox_user_active
  ON public.user_notification_inbox(user_id,priority,created_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_notification_inbox_critical
  ON public.user_notification_inbox(user_id,created_at DESC)
  WHERE is_critical=true AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_notification_inbox_expired
  ON public.user_notification_inbox(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_notification_inbox_outbox
  ON public.user_notification_inbox(outbox_id)
  WHERE outbox_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_notification_inbox_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=public
AS $$
BEGIN
  NEW.updated_at:=now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_notification_inbox_updated_at ON public.user_notification_inbox;
CREATE TRIGGER trg_touch_notification_inbox_updated_at
BEFORE UPDATE ON public.user_notification_inbox
FOR EACH ROW EXECUTE FUNCTION public.touch_notification_inbox_updated_at();

CREATE OR REPLACE FUNCTION public.create_notification_inbox_item(
  _user_id uuid,
  _outbox_id uuid,
  _event text,
  _title text,
  _body text DEFAULT NULL,
  _deep_link text DEFAULT NULL,
  _data jsonb DEFAULT '{}'::jsonb,
  _priority smallint DEFAULT 5,
  _is_critical boolean DEFAULT false,
  _expires_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  _id uuid;
  _clean_event text:=lower(btrim(_event));
  _clean_title text:=btrim(_title);
  _clean_body text:=NULLIF(btrim(_body),'');
  _clean_link text:=NULLIF(btrim(_deep_link),'');
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_required' USING ERRCODE='22023'; END IF;
  IF _clean_event !~ '^[a-z0-9_.-]{3,80}$' THEN RAISE EXCEPTION 'invalid_event' USING ERRCODE='22023'; END IF;
  IF char_length(_clean_title) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid_title' USING ERRCODE='22023'; END IF;
  IF _clean_body IS NOT NULL AND char_length(_clean_body)>500 THEN RAISE EXCEPTION 'invalid_body' USING ERRCODE='22023'; END IF;
  IF _clean_link IS NOT NULL AND NOT (_clean_link LIKE '/#/%' OR _clean_link LIKE 'apois://%') THEN
    RAISE EXCEPTION 'invalid_deep_link' USING ERRCODE='22023';
  END IF;
  IF _data IS NULL OR jsonb_typeof(_data)<>'object' OR pg_column_size(_data)>8192 THEN
    RAISE EXCEPTION 'invalid_data' USING ERRCODE='22023';
  END IF;
  IF jsonb_object_length(_data)>30 THEN RAISE EXCEPTION 'too_many_data_fields' USING ERRCODE='22023'; END IF;
  IF _priority NOT BETWEEN 1 AND 9 THEN RAISE EXCEPTION 'invalid_priority' USING ERRCODE='22023'; END IF;
  IF _expires_at IS NOT NULL AND _expires_at<now() THEN RAISE EXCEPTION 'already_expired' USING ERRCODE='22023'; END IF;

  INSERT INTO public.user_notification_inbox(user_id,outbox_id,event,title,body,deep_link,data,priority,is_critical,expires_at)
  VALUES(_user_id,_outbox_id,_clean_event,_clean_title,_clean_body,_clean_link,_data,_priority,COALESCE(_is_critical,false),_expires_at)
  ON CONFLICT (user_id,outbox_id) WHERE outbox_id IS NOT NULL
  DO UPDATE SET outbox_id=EXCLUDED.outbox_id
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_my_notification_read(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  UPDATE public.user_notification_inbox
     SET read_at=COALESCE(read_at,now())
   WHERE id=_id AND user_id=auth.uid();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_my_notification_opened(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  UPDATE public.user_notification_inbox
     SET read_at=COALESCE(read_at,now()), opened_at=COALESCE(opened_at,now())
   WHERE id=_id AND user_id=auth.uid() AND archived_at IS NULL;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_my_notification(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  UPDATE public.user_notification_inbox
     SET archived_at=COALESCE(archived_at,now()), read_at=COALESCE(read_at,now())
   WHERE id=_id AND user_id=auth.uid();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_my_notification(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  UPDATE public.user_notification_inbox
     SET archived_at=NULL
   WHERE id=_id AND user_id=auth.uid() AND (expires_at IS NULL OR expires_at>now());
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_my_notifications_read(_before timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE _count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  IF _before>now()+interval '5 minutes' THEN RAISE EXCEPTION 'invalid_before' USING ERRCODE='22023'; END IF;
  UPDATE public.user_notification_inbox
     SET read_at=now()
   WHERE user_id=auth.uid() AND read_at IS NULL AND archived_at IS NULL AND created_at<=_before;
  GET DIAGNOSTICS _count=ROW_COUNT;
  RETURN _count;
END;
$$;

CREATE OR REPLACE FUNCTION public.my_unread_notification_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=public
AS $$
  SELECT count(*)::integer
  FROM public.user_notification_inbox
  WHERE user_id=auth.uid()
    AND read_at IS NULL
    AND archived_at IS NULL
    AND (expires_at IS NULL OR expires_at>now());
$$;

CREATE OR REPLACE FUNCTION public.cleanup_notification_inbox(
  _read_retention_days integer DEFAULT 90,
  _archived_retention_days integer DEFAULT 30,
  _limit integer DEFAULT 1000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE _count integer;
BEGIN
  IF _read_retention_days NOT BETWEEN 30 AND 730 THEN RAISE EXCEPTION 'invalid_read_retention' USING ERRCODE='22023'; END IF;
  IF _archived_retention_days NOT BETWEEN 7 AND 365 THEN RAISE EXCEPTION 'invalid_archived_retention' USING ERRCODE='22023'; END IF;
  IF _limit NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'invalid_limit' USING ERRCODE='22023'; END IF;

  WITH doomed AS (
    SELECT id
    FROM public.user_notification_inbox
    WHERE (expires_at IS NOT NULL AND expires_at<now()-interval '7 days')
       OR (archived_at IS NOT NULL AND archived_at<now()-make_interval(days=>_archived_retention_days))
       OR (read_at IS NOT NULL AND archived_at IS NULL AND read_at<now()-make_interval(days=>_read_retention_days))
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  DELETE FROM public.user_notification_inbox i
  USING doomed d
  WHERE i.id=d.id;

  GET DIAGNOSTICS _count=ROW_COUNT;
  RETURN _count;
END;
$$;

ALTER TABLE public.user_notification_inbox ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_notification_inbox' AND policyname='notification_inbox_select_own') THEN
    CREATE POLICY notification_inbox_select_own
      ON public.user_notification_inbox
      FOR SELECT TO authenticated
      USING (user_id=auth.uid());
  END IF;
END $$;

REVOKE INSERT,UPDATE,DELETE ON public.user_notification_inbox FROM anon,authenticated;
GRANT SELECT ON public.user_notification_inbox TO authenticated;

REVOKE ALL ON FUNCTION public.touch_notification_inbox_updated_at() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_notification_inbox_item(uuid,uuid,text,text,text,text,jsonb,smallint,boolean,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.mark_my_notification_read(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.mark_my_notification_opened(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.archive_my_notification(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.restore_my_notification(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.mark_all_my_notifications_read(timestamptz) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.my_unread_notification_count() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.cleanup_notification_inbox(integer,integer,integer) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.create_notification_inbox_item(uuid,uuid,text,text,text,text,jsonb,smallint,boolean,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_my_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_my_notification_opened(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_my_notification(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_my_notification(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_my_notifications_read(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_unread_notification_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_notification_inbox(integer,integer,integer) TO service_role;

COMMIT;
