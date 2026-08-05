-- Synchronize the in-app inbox with push delivery lifecycle and provide safe pagination/bulk actions.
BEGIN;

ALTER TABLE public.user_notification_inbox
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS push_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS push_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS delivery_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_delivery_error text,
  ADD COLUMN IF NOT EXISTS last_delivery_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_inbox_delivery_status_safe') THEN
    ALTER TABLE public.user_notification_inbox
      ADD CONSTRAINT notification_inbox_delivery_status_safe
      CHECK (delivery_status IN ('pending','processing','sent','failed','dead_letter','cancelled','in_app_only')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_inbox_delivery_attempts_safe') THEN
    ALTER TABLE public.user_notification_inbox
      ADD CONSTRAINT notification_inbox_delivery_attempts_safe
      CHECK (delivery_attempts BETWEEN 0 AND 100) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_inbox_provider_message_safe') THEN
    ALTER TABLE public.user_notification_inbox
      ADD CONSTRAINT notification_inbox_provider_message_safe
      CHECK (provider_message_id IS NULL OR char_length(provider_message_id) <= 500) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_inbox_delivery_error_safe') THEN
    ALTER TABLE public.user_notification_inbox
      ADD CONSTRAINT notification_inbox_delivery_error_safe
      CHECK (last_delivery_error IS NULL OR char_length(last_delivery_error) <= 160) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_inbox_sent_consistent') THEN
    ALTER TABLE public.user_notification_inbox
      ADD CONSTRAINT notification_inbox_sent_consistent
      CHECK (push_sent_at IS NULL OR delivery_status='sent') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_inbox_failed_consistent') THEN
    ALTER TABLE public.user_notification_inbox
      ADD CONSTRAINT notification_inbox_failed_consistent
      CHECK (push_failed_at IS NULL OR delivery_status IN ('failed','dead_letter')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_inbox_delivery_time_safe') THEN
    ALTER TABLE public.user_notification_inbox
      ADD CONSTRAINT notification_inbox_delivery_time_safe
      CHECK (last_delivery_at IS NULL OR last_delivery_at >= created_at) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_notification_inbox_delivery_status
  ON public.user_notification_inbox(user_id,delivery_status,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_notification_inbox_delivery_failed
  ON public.user_notification_inbox(push_failed_at DESC)
  WHERE push_failed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_notification_inbox_delivery_sent
  ON public.user_notification_inbox(push_sent_at DESC)
  WHERE push_sent_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_notification_inbox_last_delivery
  ON public.user_notification_inbox(last_delivery_at DESC)
  WHERE last_delivery_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_notification_inbox_from_outbox()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  _deep_link text;
  _is_critical boolean := false;
BEGIN
  IF TG_OP='INSERT' THEN
    _deep_link := NULLIF(NEW.data->>'deep_link','');
    IF _deep_link IS NOT NULL AND NOT (_deep_link LIKE '/#/%' OR _deep_link LIKE 'apois://%') THEN
      _deep_link := NULL;
    END IF;
    _is_critical := COALESCE((NEW.data->>'is_critical')::boolean,false);

    INSERT INTO public.user_notification_inbox(
      user_id,outbox_id,event,title,body,deep_link,data,priority,is_critical,expires_at,
      delivery_status,delivery_attempts,last_delivery_at
    ) VALUES (
      NEW.user_id,NEW.id,NEW.event,NEW.title,NEW.body,_deep_link,COALESCE(NEW.data,'{}'::jsonb),
      NEW.priority,_is_critical,NULL,NEW.status,NEW.attempt_count,NEW.updated_at
    )
    ON CONFLICT (user_id,outbox_id) WHERE outbox_id IS NOT NULL
    DO NOTHING;
    RETURN NEW;
  END IF;

  UPDATE public.user_notification_inbox
     SET delivery_status = NEW.status,
         delivery_attempts = NEW.attempt_count,
         push_sent_at = CASE WHEN NEW.status='sent' THEN COALESCE(NEW.sent_at,now()) ELSE NULL END,
         push_failed_at = CASE WHEN NEW.status IN ('failed','dead_letter') THEN COALESCE(NEW.last_error_at,now()) ELSE NULL END,
         provider_message_id = NEW.provider_message_id,
         last_delivery_error = NEW.last_error_code,
         last_delivery_at = NEW.updated_at
   WHERE outbox_id=NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_notification_inbox_insert ON public.push_delivery_outbox;
CREATE TRIGGER trg_sync_notification_inbox_insert
AFTER INSERT ON public.push_delivery_outbox
FOR EACH ROW EXECUTE FUNCTION public.sync_notification_inbox_from_outbox();

DROP TRIGGER IF EXISTS trg_sync_notification_inbox_update ON public.push_delivery_outbox;
CREATE TRIGGER trg_sync_notification_inbox_update
AFTER UPDATE OF status,attempt_count,sent_at,last_error_code,last_error_at,provider_message_id,updated_at
ON public.push_delivery_outbox
FOR EACH ROW EXECUTE FUNCTION public.sync_notification_inbox_from_outbox();

CREATE OR REPLACE FUNCTION public.list_my_notifications(
  _limit integer DEFAULT 30,
  _cursor_created_at timestamptz DEFAULT NULL,
  _cursor_id uuid DEFAULT NULL,
  _include_archived boolean DEFAULT false,
  _only_unread boolean DEFAULT false
)
RETURNS TABLE(
  id uuid,
  event text,
  title text,
  body text,
  deep_link text,
  data jsonb,
  priority smallint,
  is_critical boolean,
  read_at timestamptz,
  opened_at timestamptz,
  archived_at timestamptz,
  expires_at timestamptz,
  delivery_status text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  IF _limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid_limit' USING ERRCODE='22023'; END IF;
  IF (_cursor_created_at IS NULL) <> (_cursor_id IS NULL) THEN RAISE EXCEPTION 'incomplete_cursor' USING ERRCODE='22023'; END IF;

  RETURN QUERY
  SELECT i.id,i.event,i.title,i.body,i.deep_link,i.data,i.priority,i.is_critical,
         i.read_at,i.opened_at,i.archived_at,i.expires_at,i.delivery_status,i.created_at
    FROM public.user_notification_inbox i
   WHERE i.user_id=auth.uid()
     AND (_include_archived OR i.archived_at IS NULL)
     AND (NOT _only_unread OR i.read_at IS NULL)
     AND (i.expires_at IS NULL OR i.expires_at>now())
     AND (
       _cursor_created_at IS NULL
       OR (i.created_at,i.id) < (_cursor_created_at,_cursor_id)
     )
   ORDER BY i.created_at DESC,i.id DESC
   LIMIT _limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_mark_my_notifications_read(_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE _count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  IF _ids IS NULL OR cardinality(_ids)=0 OR cardinality(_ids)>100 THEN
    RAISE EXCEPTION 'invalid_ids' USING ERRCODE='22023';
  END IF;
  UPDATE public.user_notification_inbox
     SET read_at=COALESCE(read_at,now())
   WHERE user_id=auth.uid()
     AND id=ANY(_ids)
     AND archived_at IS NULL
     AND (expires_at IS NULL OR expires_at>now());
  GET DIAGNOSTICS _count=ROW_COUNT;
  RETURN _count;
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_archive_my_notifications(_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE _count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  IF _ids IS NULL OR cardinality(_ids)=0 OR cardinality(_ids)>100 THEN
    RAISE EXCEPTION 'invalid_ids' USING ERRCODE='22023';
  END IF;
  UPDATE public.user_notification_inbox
     SET archived_at=COALESCE(archived_at,now()),read_at=COALESCE(read_at,now())
   WHERE user_id=auth.uid()
     AND id=ANY(_ids);
  GET DIAGNOSTICS _count=ROW_COUNT;
  RETURN _count;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_expired_my_notifications(_limit integer DEFAULT 200)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE _count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  IF _limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid_limit' USING ERRCODE='22023'; END IF;

  WITH expired AS (
    SELECT id
      FROM public.user_notification_inbox
     WHERE user_id=auth.uid()
       AND expires_at IS NOT NULL
       AND expires_at<=now()
       AND archived_at IS NULL
     ORDER BY expires_at,id
     LIMIT _limit
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.user_notification_inbox i
     SET archived_at=now(),read_at=COALESCE(read_at,now())
    FROM expired e
   WHERE i.id=e.id;
  GET DIAGNOSTICS _count=ROW_COUNT;
  RETURN _count;
END;
$$;

CREATE OR REPLACE VIEW public.my_notification_inbox_summary
WITH (security_invoker=true)
AS
SELECT
  user_id,
  count(*) FILTER (WHERE archived_at IS NULL AND (expires_at IS NULL OR expires_at>now())) AS active_count,
  count(*) FILTER (WHERE read_at IS NULL AND archived_at IS NULL AND (expires_at IS NULL OR expires_at>now())) AS unread_count,
  count(*) FILTER (WHERE is_critical AND read_at IS NULL AND archived_at IS NULL AND (expires_at IS NULL OR expires_at>now())) AS critical_unread_count,
  max(created_at) FILTER (WHERE archived_at IS NULL) AS latest_created_at,
  max(read_at) AS latest_read_at
FROM public.user_notification_inbox
GROUP BY user_id;

REVOKE ALL ON FUNCTION public.sync_notification_inbox_from_outbox() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.list_my_notifications(integer,timestamptz,uuid,boolean,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.bulk_mark_my_notifications_read(uuid[]) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.bulk_archive_my_notifications(uuid[]) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.archive_expired_my_notifications(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_my_notifications(integer,timestamptz,uuid,boolean,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_mark_my_notifications_read(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_archive_my_notifications(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_expired_my_notifications(integer) TO authenticated;

REVOKE ALL ON public.my_notification_inbox_summary FROM PUBLIC,anon;
GRANT SELECT ON public.my_notification_inbox_summary TO authenticated;

COMMIT;
