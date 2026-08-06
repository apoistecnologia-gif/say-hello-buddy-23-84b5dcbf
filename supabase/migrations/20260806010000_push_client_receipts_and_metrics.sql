-- Secure client-side push receipts, delivery telemetry and bounded retention.
-- Additive migration: existing notifications and tokens are not rewritten or deleted.

BEGIN;

CREATE TABLE IF NOT EXISTS public.push_client_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  inbox_id uuid NOT NULL REFERENCES public.user_notification_inbox(id) ON DELETE CASCADE,
  token_id uuid REFERENCES public.user_notification_tokens(id) ON DELETE SET NULL,
  device_id text,
  app_role text,
  app_version text,
  platform text NOT NULL,
  receipt_type text NOT NULL,
  client_event_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  latency_ms integer,
  foreground boolean,
  permission_status text,
  network_type text,
  locale text,
  timezone text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_receipts_platform_safe') THEN
    ALTER TABLE public.push_client_receipts ADD CONSTRAINT push_receipts_platform_safe
      CHECK (platform IN ('android','ios','web'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_receipts_type_safe') THEN
    ALTER TABLE public.push_client_receipts ADD CONSTRAINT push_receipts_type_safe
      CHECK (receipt_type IN ('received','displayed','opened','dismissed','actioned','permission_denied'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_receipts_event_id_safe') THEN
    ALTER TABLE public.push_client_receipts ADD CONSTRAINT push_receipts_event_id_safe
      CHECK (client_event_id ~ '^[A-Za-z0-9_.:-]{8,160}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_receipts_device_safe') THEN
    ALTER TABLE public.push_client_receipts ADD CONSTRAINT push_receipts_device_safe
      CHECK (device_id IS NULL OR char_length(btrim(device_id)) BETWEEN 8 AND 200);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_receipts_app_role_safe') THEN
    ALTER TABLE public.push_client_receipts ADD CONSTRAINT push_receipts_app_role_safe
      CHECK (app_role IS NULL OR app_role IN ('passageiro','motorista','admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_receipts_app_version_safe') THEN
    ALTER TABLE public.push_client_receipts ADD CONSTRAINT push_receipts_app_version_safe
      CHECK (app_version IS NULL OR char_length(app_version) BETWEEN 1 AND 40);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_receipts_latency_safe') THEN
    ALTER TABLE public.push_client_receipts ADD CONSTRAINT push_receipts_latency_safe
      CHECK (latency_ms IS NULL OR latency_ms BETWEEN 0 AND 86400000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_receipts_permission_safe') THEN
    ALTER TABLE public.push_client_receipts ADD CONSTRAINT push_receipts_permission_safe
      CHECK (permission_status IS NULL OR permission_status IN ('prompt','granted','denied'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_receipts_network_safe') THEN
    ALTER TABLE public.push_client_receipts ADD CONSTRAINT push_receipts_network_safe
      CHECK (network_type IS NULL OR network_type IN ('wifi','cellular','ethernet','offline','unknown'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_receipts_locale_safe') THEN
    ALTER TABLE public.push_client_receipts ADD CONSTRAINT push_receipts_locale_safe
      CHECK (locale IS NULL OR locale ~ '^[A-Za-z]{2,3}([_-][A-Za-z]{2})?$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_receipts_timezone_safe') THEN
    ALTER TABLE public.push_client_receipts ADD CONSTRAINT push_receipts_timezone_safe
      CHECK (timezone IS NULL OR char_length(timezone) BETWEEN 1 AND 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_receipts_metadata_safe') THEN
    ALTER TABLE public.push_client_receipts ADD CONSTRAINT push_receipts_metadata_safe
      CHECK (jsonb_typeof(metadata)='object' AND pg_column_size(metadata) <= 4096);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_receipts_occurred_safe') THEN
    ALTER TABLE public.push_client_receipts ADD CONSTRAINT push_receipts_occurred_safe
      CHECK (occurred_at <= received_at + interval '5 minutes' AND occurred_at >= received_at - interval '30 days');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_receipts_created_safe') THEN
    ALTER TABLE public.push_client_receipts ADD CONSTRAINT push_receipts_created_safe
      CHECK (created_at >= received_at - interval '1 minute');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_push_client_receipts_user_event
  ON public.push_client_receipts(user_id,client_event_id);
CREATE INDEX IF NOT EXISTS ix_push_client_receipts_inbox_type
  ON public.push_client_receipts(inbox_id,receipt_type,occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_push_client_receipts_user_created
  ON public.push_client_receipts(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_push_client_receipts_token_created
  ON public.push_client_receipts(token_id,created_at DESC)
  WHERE token_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_push_client_receipts_device_created
  ON public.push_client_receipts(device_id,created_at DESC)
  WHERE device_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_push_client_receipts_platform_type
  ON public.push_client_receipts(platform,receipt_type,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_push_client_receipts_latency
  ON public.push_client_receipts(latency_ms DESC)
  WHERE latency_ms IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_push_client_receipts_permission_denied
  ON public.push_client_receipts(user_id,created_at DESC)
  WHERE receipt_type='permission_denied';

CREATE OR REPLACE FUNCTION public.report_my_push_receipt(
  _inbox_id uuid,
  _client_event_id text,
  _platform text,
  _receipt_type text,
  _occurred_at timestamptz,
  _token_id uuid DEFAULT NULL,
  _device_id text DEFAULT NULL,
  _app_role text DEFAULT NULL,
  _app_version text DEFAULT NULL,
  _latency_ms integer DEFAULT NULL,
  _foreground boolean DEFAULT NULL,
  _permission_status text DEFAULT NULL,
  _network_type text DEFAULT NULL,
  _locale text DEFAULT NULL,
  _timezone text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  _user_id uuid:=auth.uid();
  _id uuid;
  _clean_event text:=btrim(_client_event_id);
  _clean_platform text:=lower(btrim(_platform));
  _clean_type text:=lower(btrim(_receipt_type));
  _clean_device text:=NULLIF(btrim(_device_id),'');
  _inbox_user uuid;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  IF _inbox_id IS NULL THEN RAISE EXCEPTION 'inbox_required' USING ERRCODE='22023'; END IF;
  IF _clean_event !~ '^[A-Za-z0-9_.:-]{8,160}$' THEN RAISE EXCEPTION 'invalid_client_event_id' USING ERRCODE='22023'; END IF;
  IF _clean_platform NOT IN ('android','ios','web') THEN RAISE EXCEPTION 'invalid_platform' USING ERRCODE='22023'; END IF;
  IF _clean_type NOT IN ('received','displayed','opened','dismissed','actioned','permission_denied') THEN RAISE EXCEPTION 'invalid_receipt_type' USING ERRCODE='22023'; END IF;
  IF _occurred_at IS NULL OR _occurred_at>now()+interval '5 minutes' OR _occurred_at<now()-interval '30 days' THEN
    RAISE EXCEPTION 'invalid_occurred_at' USING ERRCODE='22023';
  END IF;
  IF _clean_device IS NOT NULL AND char_length(_clean_device) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'invalid_device_id' USING ERRCODE='22023'; END IF;
  IF _app_role IS NOT NULL AND _app_role NOT IN ('passageiro','motorista','admin') THEN RAISE EXCEPTION 'invalid_app_role' USING ERRCODE='22023'; END IF;
  IF _app_version IS NOT NULL AND char_length(_app_version) NOT BETWEEN 1 AND 40 THEN RAISE EXCEPTION 'invalid_app_version' USING ERRCODE='22023'; END IF;
  IF _latency_ms IS NOT NULL AND _latency_ms NOT BETWEEN 0 AND 86400000 THEN RAISE EXCEPTION 'invalid_latency' USING ERRCODE='22023'; END IF;
  IF _permission_status IS NOT NULL AND _permission_status NOT IN ('prompt','granted','denied') THEN RAISE EXCEPTION 'invalid_permission' USING ERRCODE='22023'; END IF;
  IF _network_type IS NOT NULL AND _network_type NOT IN ('wifi','cellular','ethernet','offline','unknown') THEN RAISE EXCEPTION 'invalid_network' USING ERRCODE='22023'; END IF;
  IF _metadata IS NULL OR jsonb_typeof(_metadata)<>'object' OR pg_column_size(_metadata)>4096 OR jsonb_object_length(_metadata)>20 THEN
    RAISE EXCEPTION 'invalid_metadata' USING ERRCODE='22023';
  END IF;

  SELECT user_id INTO _inbox_user FROM public.user_notification_inbox WHERE id=_inbox_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'inbox_not_found' USING ERRCODE='P0002'; END IF;
  IF _inbox_user<>_user_id THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;

  IF _token_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.user_notification_tokens WHERE id=_token_id AND user_id=_user_id
  ) THEN RAISE EXCEPTION 'token_not_owned' USING ERRCODE='42501'; END IF;

  INSERT INTO public.push_client_receipts(
    user_id,inbox_id,token_id,device_id,app_role,app_version,platform,receipt_type,
    client_event_id,occurred_at,latency_ms,foreground,permission_status,network_type,
    locale,timezone,metadata
  ) VALUES (
    _user_id,_inbox_id,_token_id,_clean_device,_app_role,_app_version,_clean_platform,_clean_type,
    _clean_event,_occurred_at,_latency_ms,_foreground,_permission_status,_network_type,
    _locale,_timezone,_metadata
  )
  ON CONFLICT (user_id,client_event_id) DO UPDATE SET client_event_id=EXCLUDED.client_event_id
  RETURNING id INTO _id;

  IF _clean_type='opened' THEN
    UPDATE public.user_notification_inbox
       SET read_at=COALESCE(read_at,_occurred_at), opened_at=COALESCE(opened_at,_occurred_at)
     WHERE id=_inbox_id AND user_id=_user_id;
  ELSIF _clean_type IN ('displayed','received','actioned') THEN
    UPDATE public.user_notification_inbox
       SET read_at=CASE WHEN _clean_type='actioned' THEN COALESCE(read_at,_occurred_at) ELSE read_at END,
           opened_at=CASE WHEN _clean_type='actioned' THEN COALESCE(opened_at,_occurred_at) ELSE opened_at END
     WHERE id=_inbox_id AND user_id=_user_id;
  END IF;

  IF _token_id IS NOT NULL THEN
    UPDATE public.user_notification_tokens
       SET last_used_at=now(),
           permission_status=COALESCE(_permission_status,permission_status),
           app_version=COALESCE(_app_version,app_version),
           locale=COALESCE(_locale,locale),
           timezone=COALESCE(_timezone,timezone)
     WHERE id=_token_id AND user_id=_user_id;
  END IF;

  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_my_push_receipts_batch(_items jsonb)
RETURNS TABLE(accepted integer,rejected integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  _item jsonb;
  _accepted integer:=0;
  _rejected integer:=0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  IF _items IS NULL OR jsonb_typeof(_items)<>'array' OR jsonb_array_length(_items) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'invalid_items' USING ERRCODE='22023';
  END IF;

  FOR _item IN SELECT value FROM jsonb_array_elements(_items)
  LOOP
    BEGIN
      PERFORM public.report_my_push_receipt(
        (_item->>'inbox_id')::uuid,
        _item->>'client_event_id',
        _item->>'platform',
        _item->>'receipt_type',
        (_item->>'occurred_at')::timestamptz,
        NULLIF(_item->>'token_id','')::uuid,
        _item->>'device_id',
        _item->>'app_role',
        _item->>'app_version',
        NULLIF(_item->>'latency_ms','')::integer,
        NULLIF(_item->>'foreground','')::boolean,
        _item->>'permission_status',
        _item->>'network_type',
        _item->>'locale',
        _item->>'timezone',
        COALESCE(_item->'metadata','{}'::jsonb)
      );
      _accepted:=_accepted+1;
    EXCEPTION WHEN OTHERS THEN
      _rejected:=_rejected+1;
    END;
  END LOOP;

  RETURN QUERY SELECT _accepted,_rejected;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_push_client_receipts(
  _retention_days integer DEFAULT 180,
  _limit integer DEFAULT 5000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE _count integer;
BEGIN
  IF _retention_days NOT BETWEEN 30 AND 730 THEN RAISE EXCEPTION 'invalid_retention' USING ERRCODE='22023'; END IF;
  IF _limit NOT BETWEEN 1 AND 20000 THEN RAISE EXCEPTION 'invalid_limit' USING ERRCODE='22023'; END IF;
  WITH doomed AS (
    SELECT id FROM public.push_client_receipts
    WHERE created_at<now()-make_interval(days=>_retention_days)
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  DELETE FROM public.push_client_receipts r USING doomed d WHERE r.id=d.id;
  GET DIAGNOSTICS _count=ROW_COUNT;
  RETURN _count;
END;
$$;

CREATE OR REPLACE VIEW public.push_client_delivery_metrics
WITH (security_invoker=true)
AS
SELECT
  date_trunc('day',created_at) AS metric_day,
  platform,
  receipt_type,
  count(*) AS receipt_count,
  count(DISTINCT user_id) AS unique_users,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS p50_latency_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS p95_latency_ms,
  avg(latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS avg_latency_ms
FROM public.push_client_receipts
GROUP BY date_trunc('day',created_at),platform,receipt_type;

ALTER TABLE public.push_client_receipts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='push_client_receipts' AND policyname='push_receipts_select_own') THEN
    CREATE POLICY push_receipts_select_own ON public.push_client_receipts
      FOR SELECT TO authenticated USING (user_id=auth.uid());
  END IF;
END $$;

REVOKE INSERT,UPDATE,DELETE ON public.push_client_receipts FROM anon,authenticated;
GRANT SELECT ON public.push_client_receipts TO authenticated;
REVOKE ALL ON public.push_client_delivery_metrics FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.push_client_delivery_metrics TO service_role;

REVOKE ALL ON FUNCTION public.report_my_push_receipt(uuid,text,text,text,timestamptz,uuid,text,text,text,integer,boolean,text,text,text,text,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.report_my_push_receipts_batch(jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.cleanup_push_client_receipts(integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.report_my_push_receipt(uuid,text,text,text,timestamptz,uuid,text,text,text,integer,boolean,text,text,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_my_push_receipts_batch(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_push_client_receipts(integer,integer) TO service_role;

COMMIT;
