-- Canonical push event catalog and safe enqueue wrapper.
-- Additive migration: existing outbox rows and delivery functions remain untouched.
BEGIN;

CREATE TABLE IF NOT EXISTS public.push_event_catalog (
  event text PRIMARY KEY,
  title_template text NOT NULL,
  body_template text,
  channel_id text NOT NULL DEFAULT 'apois_rides',
  default_priority smallint NOT NULL DEFAULT 5,
  ttl_seconds integer NOT NULL DEFAULT 120,
  is_critical boolean NOT NULL DEFAULT false,
  allow_passenger boolean NOT NULL DEFAULT false,
  allow_driver boolean NOT NULL DEFAULT false,
  allow_admin boolean NOT NULL DEFAULT false,
  dedupe_window_seconds integer NOT NULL DEFAULT 30,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_event_catalog_event_safe') THEN
    ALTER TABLE public.push_event_catalog ADD CONSTRAINT push_event_catalog_event_safe
      CHECK (event ~ '^[a-z0-9_.-]{3,80}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_event_catalog_title_safe') THEN
    ALTER TABLE public.push_event_catalog ADD CONSTRAINT push_event_catalog_title_safe
      CHECK (char_length(btrim(title_template)) BETWEEN 1 AND 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_event_catalog_body_safe') THEN
    ALTER TABLE public.push_event_catalog ADD CONSTRAINT push_event_catalog_body_safe
      CHECK (body_template IS NULL OR char_length(body_template) <= 500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_event_catalog_channel_safe') THEN
    ALTER TABLE public.push_event_catalog ADD CONSTRAINT push_event_catalog_channel_safe
      CHECK (channel_id ~ '^[a-zA-Z0-9_.-]{3,80}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_event_catalog_priority_safe') THEN
    ALTER TABLE public.push_event_catalog ADD CONSTRAINT push_event_catalog_priority_safe
      CHECK (default_priority BETWEEN 1 AND 9);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_event_catalog_ttl_safe') THEN
    ALTER TABLE public.push_event_catalog ADD CONSTRAINT push_event_catalog_ttl_safe
      CHECK (ttl_seconds BETWEEN 15 AND 86400);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_event_catalog_dedupe_safe') THEN
    ALTER TABLE public.push_event_catalog ADD CONSTRAINT push_event_catalog_dedupe_safe
      CHECK (dedupe_window_seconds BETWEEN 0 AND 86400);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_event_catalog_actor_safe') THEN
    ALTER TABLE public.push_event_catalog ADD CONSTRAINT push_event_catalog_actor_safe
      CHECK (allow_passenger OR allow_driver OR allow_admin);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_push_event_catalog_enabled
  ON public.push_event_catalog(enabled, event);
CREATE INDEX IF NOT EXISTS ix_push_event_catalog_critical
  ON public.push_event_catalog(is_critical, enabled)
  WHERE enabled = true;
CREATE INDEX IF NOT EXISTS ix_push_event_catalog_channel
  ON public.push_event_catalog(channel_id, event)
  WHERE enabled = true;

CREATE OR REPLACE FUNCTION public.touch_push_event_catalog_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_push_event_catalog_updated_at ON public.push_event_catalog;
CREATE TRIGGER trg_touch_push_event_catalog_updated_at
BEFORE UPDATE ON public.push_event_catalog
FOR EACH ROW EXECUTE FUNCTION public.touch_push_event_catalog_updated_at();

INSERT INTO public.push_event_catalog(
  event,title_template,body_template,channel_id,default_priority,ttl_seconds,
  is_critical,allow_passenger,allow_driver,allow_admin,dedupe_window_seconds
)
VALUES
  ('ride.accepted','Corrida aceita','Um motorista aceitou sua solicitação.','apois_rides',2,180,true,false,true,true,30),
  ('ride.driver_arrived','Motorista no local','Seu motorista chegou ao ponto de embarque.','apois_rides',1,300,true,false,true,true,30),
  ('ride.started','Corrida iniciada','Sua viagem começou. Tenha um bom trajeto!','apois_rides',1,300,true,false,true,true,30),
  ('ride.completed','Corrida finalizada','Você chegou ao seu destino.','apois_rides',2,300,true,false,true,true,30),
  ('ride.cancelled','Corrida cancelada','A solicitação de corrida foi cancelada.','apois_rides',1,300,true,true,true,true,30),
  ('driver.new_ride_request','Nova solicitação de corrida','Há uma nova corrida disponível.','apois_rides',1,120,true,false,false,true,15),
  ('wallet.balance_updated','Saldo atualizado','Sua carteira foi atualizada.','apois_finance',4,1800,false,false,false,true,60),
  ('wallet.withdrawal_updated','Saque atualizado','O status do seu saque foi atualizado.','apois_finance',3,1800,false,false,false,true,60),
  ('admin.notice','Aviso da APOIS',NULL,'apois_general',5,3600,false,false,false,true,60)
ON CONFLICT (event) DO UPDATE SET
  title_template = EXCLUDED.title_template,
  body_template = EXCLUDED.body_template,
  channel_id = EXCLUDED.channel_id,
  default_priority = EXCLUDED.default_priority,
  ttl_seconds = EXCLUDED.ttl_seconds,
  is_critical = EXCLUDED.is_critical,
  allow_passenger = EXCLUDED.allow_passenger,
  allow_driver = EXCLUDED.allow_driver,
  allow_admin = EXCLUDED.allow_admin,
  dedupe_window_seconds = EXCLUDED.dedupe_window_seconds,
  enabled = true;

CREATE OR REPLACE FUNCTION public.enqueue_push_event(
  _user_id uuid,
  _event text,
  _dedupe_subject text,
  _data jsonb DEFAULT '{}'::jsonb,
  _title_override text DEFAULT NULL,
  _body_override text DEFAULT NULL,
  _priority_override smallint DEFAULT NULL,
  _max_attempts integer DEFAULT 5
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _catalog public.push_event_catalog;
  _clean_event text := lower(btrim(_event));
  _clean_subject text := btrim(COALESCE(_dedupe_subject,''));
  _title text;
  _body text;
  _priority smallint;
  _dedupe_key text;
  _bucket bigint;
  _id uuid;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required' USING ERRCODE='22023';
  END IF;
  IF _clean_event !~ '^[a-z0-9_.-]{3,80}$' THEN
    RAISE EXCEPTION 'invalid_event' USING ERRCODE='22023';
  END IF;
  IF char_length(_clean_subject) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'invalid_dedupe_subject' USING ERRCODE='22023';
  END IF;
  IF _data IS NULL OR jsonb_typeof(_data) <> 'object' THEN
    RAISE EXCEPTION 'invalid_data' USING ERRCODE='22023';
  END IF;
  IF pg_column_size(_data) > 8192 THEN
    RAISE EXCEPTION 'data_too_large' USING ERRCODE='22023';
  END IF;
  IF jsonb_object_length(_data) > 30 THEN
    RAISE EXCEPTION 'too_many_data_fields' USING ERRCODE='22023';
  END IF;
  IF _max_attempts NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'invalid_max_attempts' USING ERRCODE='22023';
  END IF;

  SELECT * INTO _catalog
  FROM public.push_event_catalog
  WHERE event = _clean_event AND enabled = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_not_enabled' USING ERRCODE='22023';
  END IF;

  _title := COALESCE(NULLIF(btrim(_title_override),''), _catalog.title_template);
  _body := COALESCE(NULLIF(btrim(_body_override),''), _catalog.body_template);
  _priority := COALESCE(_priority_override, _catalog.default_priority);

  IF char_length(_title) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_title' USING ERRCODE='22023';
  END IF;
  IF _body IS NOT NULL AND char_length(_body) > 500 THEN
    RAISE EXCEPTION 'invalid_body' USING ERRCODE='22023';
  END IF;
  IF _priority NOT BETWEEN 1 AND 9 THEN
    RAISE EXCEPTION 'invalid_priority' USING ERRCODE='22023';
  END IF;

  _bucket := CASE
    WHEN _catalog.dedupe_window_seconds = 0 THEN floor(extract(epoch from clock_timestamp()) * 1000)::bigint
    ELSE floor(extract(epoch from clock_timestamp()) / _catalog.dedupe_window_seconds)::bigint
  END;

  _dedupe_key := encode(digest(
    _user_id::text || '|' || _clean_event || '|' || _clean_subject || '|' || _bucket::text,
    'sha256'
  ), 'hex');

  INSERT INTO public.push_delivery_outbox(
    dedupe_key,user_id,event,title,body,data,priority,max_attempts
  )
  VALUES(
    _dedupe_key,_user_id,_clean_event,_title,_body,_data,_priority,_max_attempts
  )
  ON CONFLICT (dedupe_key) DO UPDATE
    SET dedupe_key = EXCLUDED.dedupe_key
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

ALTER TABLE public.push_event_catalog ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.push_event_catalog FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.push_event_catalog TO service_role;

REVOKE ALL ON FUNCTION public.touch_push_event_catalog_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_push_event(uuid,text,text,jsonb,text,text,smallint,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_push_event(uuid,text,text,jsonb,text,text,smallint,integer) TO service_role;

COMMIT;
