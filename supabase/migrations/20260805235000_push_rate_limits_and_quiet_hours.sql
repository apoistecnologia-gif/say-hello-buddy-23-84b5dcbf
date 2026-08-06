-- Push safety controls: per-user limits, quiet hours, cooldowns and bounded maintenance.
BEGIN;

ALTER TABLE public.user_notification_preferences
  ADD COLUMN IF NOT EXISTS quiet_hours_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quiet_hours_start time,
  ADD COLUMN IF NOT EXISTS quiet_hours_end time,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Recife',
  ADD COLUMN IF NOT EXISTS critical_alerts_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS marketing_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_push_per_hour smallint NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS max_push_per_day smallint NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS minimum_interval_seconds integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS muted_until timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_preferences_quiet_hours_consistent') THEN
    ALTER TABLE public.user_notification_preferences
      ADD CONSTRAINT notification_preferences_quiet_hours_consistent
      CHECK (
        (quiet_hours_enabled = false)
        OR (quiet_hours_start IS NOT NULL AND quiet_hours_end IS NOT NULL)
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_preferences_timezone_safe') THEN
    ALTER TABLE public.user_notification_preferences
      ADD CONSTRAINT notification_preferences_timezone_safe
      CHECK (char_length(timezone) BETWEEN 3 AND 64 AND timezone !~ '[[:cntrl:]]') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_preferences_hour_limit_safe') THEN
    ALTER TABLE public.user_notification_preferences
      ADD CONSTRAINT notification_preferences_hour_limit_safe
      CHECK (max_push_per_hour BETWEEN 1 AND 120) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_preferences_day_limit_safe') THEN
    ALTER TABLE public.user_notification_preferences
      ADD CONSTRAINT notification_preferences_day_limit_safe
      CHECK (max_push_per_day BETWEEN 1 AND 1000) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_preferences_interval_safe') THEN
    ALTER TABLE public.user_notification_preferences
      ADD CONSTRAINT notification_preferences_interval_safe
      CHECK (minimum_interval_seconds BETWEEN 0 AND 3600) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_preferences_limits_consistent') THEN
    ALTER TABLE public.user_notification_preferences
      ADD CONSTRAINT notification_preferences_limits_consistent
      CHECK (max_push_per_day >= max_push_per_hour) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_notification_preferences_muted_until
  ON public.user_notification_preferences(muted_until)
  WHERE muted_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_notification_preferences_quiet_hours
  ON public.user_notification_preferences(quiet_hours_enabled)
  WHERE quiet_hours_enabled = true;

CREATE TABLE IF NOT EXISTS public.push_rate_limit_counters (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket_started_at timestamptz NOT NULL,
  bucket_kind text NOT NULL,
  sent_count integer NOT NULL DEFAULT 0,
  last_sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, bucket_started_at, bucket_kind)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_rate_bucket_kind_safe') THEN
    ALTER TABLE public.push_rate_limit_counters
      ADD CONSTRAINT push_rate_bucket_kind_safe
      CHECK (bucket_kind IN ('hour','day'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_rate_count_safe') THEN
    ALTER TABLE public.push_rate_limit_counters
      ADD CONSTRAINT push_rate_count_safe
      CHECK (sent_count >= 0 AND sent_count <= 100000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='push_rate_last_sent_consistent') THEN
    ALTER TABLE public.push_rate_limit_counters
      ADD CONSTRAINT push_rate_last_sent_consistent
      CHECK (last_sent_at IS NULL OR last_sent_at >= bucket_started_at);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_push_rate_limit_cleanup
  ON public.push_rate_limit_counters(bucket_started_at);
CREATE INDEX IF NOT EXISTS ix_push_rate_limit_user_last_sent
  ON public.push_rate_limit_counters(user_id, last_sent_at DESC)
  WHERE last_sent_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_push_preferences_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_push_preferences_updated_at ON public.user_notification_preferences;
CREATE TRIGGER trg_touch_push_preferences_updated_at
BEFORE UPDATE ON public.user_notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.touch_push_preferences_updated_at();

CREATE OR REPLACE FUNCTION public.check_and_consume_push_quota(
  _user_id uuid,
  _event text,
  _is_critical boolean DEFAULT false,
  _now timestamptz DEFAULT now()
)
RETURNS TABLE(allowed boolean, reason text, hour_count integer, day_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefs public.user_notification_preferences%ROWTYPE;
  hour_bucket timestamptz := date_trunc('hour', _now);
  day_bucket timestamptz := date_trunc('day', _now);
  current_hour integer := 0;
  current_day integer := 0;
  local_time time;
  in_quiet_hours boolean := false;
  latest_sent timestamptz;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_id_required'; END IF;
  IF _event IS NULL OR _event !~ '^[a-z0-9_.-]{3,80}$' THEN RAISE EXCEPTION 'invalid_event'; END IF;

  SELECT * INTO prefs
  FROM public.user_notification_preferences
  WHERE user_id = _user_id;

  IF NOT FOUND THEN
    prefs.max_push_per_hour := 20;
    prefs.max_push_per_day := 100;
    prefs.minimum_interval_seconds := 5;
    prefs.quiet_hours_enabled := false;
    prefs.critical_alerts_enabled := true;
  END IF;

  IF prefs.muted_until IS NOT NULL AND prefs.muted_until > _now AND NOT _is_critical THEN
    RETURN QUERY SELECT false, 'muted'::text, 0, 0;
    RETURN;
  END IF;

  IF _is_critical AND prefs.critical_alerts_enabled = false THEN
    RETURN QUERY SELECT false, 'critical_disabled'::text, 0, 0;
    RETURN;
  END IF;

  IF prefs.quiet_hours_enabled AND NOT _is_critical THEN
    BEGIN
      local_time := (_now AT TIME ZONE COALESCE(NULLIF(prefs.timezone,''),'America/Recife'))::time;
      in_quiet_hours := CASE
        WHEN prefs.quiet_hours_start < prefs.quiet_hours_end
          THEN local_time >= prefs.quiet_hours_start AND local_time < prefs.quiet_hours_end
        ELSE local_time >= prefs.quiet_hours_start OR local_time < prefs.quiet_hours_end
      END;
    EXCEPTION WHEN invalid_parameter_value THEN
      in_quiet_hours := false;
    END;
    IF in_quiet_hours THEN
      RETURN QUERY SELECT false, 'quiet_hours'::text, 0, 0;
      RETURN;
    END IF;
  END IF;

  SELECT max(last_sent_at) INTO latest_sent
  FROM public.push_rate_limit_counters
  WHERE user_id = _user_id;

  IF latest_sent IS NOT NULL
     AND prefs.minimum_interval_seconds > 0
     AND latest_sent > _now - make_interval(secs => prefs.minimum_interval_seconds)
     AND NOT _is_critical THEN
    RETURN QUERY SELECT false, 'cooldown'::text, 0, 0;
    RETURN;
  END IF;

  INSERT INTO public.push_rate_limit_counters(user_id,bucket_started_at,bucket_kind,sent_count,last_sent_at)
  VALUES (_user_id,hour_bucket,'hour',1,_now)
  ON CONFLICT (user_id,bucket_started_at,bucket_kind)
  DO UPDATE SET sent_count=public.push_rate_limit_counters.sent_count+1,last_sent_at=_now,updated_at=now()
  RETURNING sent_count INTO current_hour;

  INSERT INTO public.push_rate_limit_counters(user_id,bucket_started_at,bucket_kind,sent_count,last_sent_at)
  VALUES (_user_id,day_bucket,'day',1,_now)
  ON CONFLICT (user_id,bucket_started_at,bucket_kind)
  DO UPDATE SET sent_count=public.push_rate_limit_counters.sent_count+1,last_sent_at=_now,updated_at=now()
  RETURNING sent_count INTO current_day;

  IF NOT _is_critical AND current_hour > prefs.max_push_per_hour THEN
    RETURN QUERY SELECT false, 'hour_limit'::text, current_hour, current_day;
    RETURN;
  END IF;
  IF NOT _is_critical AND current_day > prefs.max_push_per_day THEN
    RETURN QUERY SELECT false, 'day_limit'::text, current_hour, current_day;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'allowed'::text, current_hour, current_day;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_push_rate_limit_counters(
  _retention_days integer DEFAULT 14,
  _limit integer DEFAULT 5000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE affected integer;
BEGIN
  IF _retention_days < 2 OR _retention_days > 365 THEN RAISE EXCEPTION 'invalid_retention'; END IF;
  IF _limit < 1 OR _limit > 50000 THEN RAISE EXCEPTION 'invalid_limit'; END IF;

  WITH doomed AS (
    SELECT user_id,bucket_started_at,bucket_kind
    FROM public.push_rate_limit_counters
    WHERE bucket_started_at < now() - make_interval(days => _retention_days)
    ORDER BY bucket_started_at
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.push_rate_limit_counters c
  USING doomed d
  WHERE c.user_id=d.user_id AND c.bucket_started_at=d.bucket_started_at AND c.bucket_kind=d.bucket_kind;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

ALTER TABLE public.push_rate_limit_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_rate_limit_counters FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_push_preferences_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_and_consume_push_quota(uuid,text,boolean,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_push_rate_limit_counters(integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_consume_push_quota(uuid,text,boolean,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_push_rate_limit_counters(integer,integer) TO service_role;

COMMIT;
