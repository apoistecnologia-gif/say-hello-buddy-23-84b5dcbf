-- Harden push notification storage and auditing without rewriting legacy rows.
-- Constraints are added NOT VALID where legacy data may need later reconciliation.

BEGIN;

-- 1-6: token lifecycle metadata.
ALTER TABLE public.user_notification_tokens
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS invalidated_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error_code text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 7-12: delivery audit metadata.
ALTER TABLE public.notification_logs
  ADD COLUMN IF NOT EXISTS request_id uuid,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS token_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suppressed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 13: preferences update tracking.
ALTER TABLE public.user_notification_preferences
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 14-20: defensive checks, left NOT VALID to avoid silently mutating legacy data.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_tokens_token_length_safe') THEN
    ALTER TABLE public.user_notification_tokens
      ADD CONSTRAINT notification_tokens_token_length_safe
      CHECK (char_length(btrim(token)) BETWEEN 20 AND 4096) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_tokens_platform_safe') THEN
    ALTER TABLE public.user_notification_tokens
      ADD CONSTRAINT notification_tokens_platform_safe
      CHECK (platform::text IN ('android', 'ios', 'web')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_tokens_failure_count_safe') THEN
    ALTER TABLE public.user_notification_tokens
      ADD CONSTRAINT notification_tokens_failure_count_safe
      CHECK (failure_count >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_tokens_invalidation_consistent') THEN
    ALTER TABLE public.user_notification_tokens
      ADD CONSTRAINT notification_tokens_invalidation_consistent
      CHECK (is_active OR invalidated_at IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_logs_counts_safe') THEN
    ALTER TABLE public.notification_logs
      ADD CONSTRAINT notification_logs_counts_safe
      CHECK (token_count >= 0 AND failure_count >= 0 AND suppressed_count >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_logs_failure_count_bounded') THEN
    ALTER TABLE public.notification_logs
      ADD CONSTRAINT notification_logs_failure_count_bounded
      CHECK (failure_count <= token_count) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_logs_event_length_safe') THEN
    ALTER TABLE public.notification_logs
      ADD CONSTRAINT notification_logs_event_length_safe
      CHECK (char_length(event) BETWEEN 3 AND 80) NOT VALID;
  END IF;
END $$;

-- 21-28: deduplication and operational indexes.
CREATE UNIQUE INDEX IF NOT EXISTS ux_notification_tokens_active_token
  ON public.user_notification_tokens(token)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS ix_notification_tokens_user_platform_active
  ON public.user_notification_tokens(user_id, platform)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS ix_notification_tokens_invalidated
  ON public.user_notification_tokens(invalidated_at)
  WHERE is_active = false;

CREATE INDEX IF NOT EXISTS ix_notification_tokens_last_seen
  ON public.user_notification_tokens(last_seen_at DESC)
  WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS ux_notification_preferences_user
  ON public.user_notification_preferences(user_id);

CREATE INDEX IF NOT EXISTS ix_notification_logs_user_created
  ON public.notification_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_notification_logs_event_created
  ON public.notification_logs(event, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_notification_logs_status_created
  ON public.notification_logs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_notification_logs_request_id
  ON public.notification_logs(request_id)
  WHERE request_id IS NOT NULL;

-- 29-32: consistent updated_at handling.
CREATE OR REPLACE FUNCTION public.touch_notification_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_notification_tokens_updated_at ON public.user_notification_tokens;
CREATE TRIGGER trg_touch_notification_tokens_updated_at
BEFORE UPDATE ON public.user_notification_tokens
FOR EACH ROW EXECUTE FUNCTION public.touch_notification_updated_at();

DROP TRIGGER IF EXISTS trg_touch_notification_preferences_updated_at ON public.user_notification_preferences;
CREATE TRIGGER trg_touch_notification_preferences_updated_at
BEFORE UPDATE ON public.user_notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.touch_notification_updated_at();

DROP TRIGGER IF EXISTS trg_touch_notification_logs_updated_at ON public.notification_logs;
CREATE TRIGGER trg_touch_notification_logs_updated_at
BEFORE UPDATE ON public.notification_logs
FOR EACH ROW EXECUTE FUNCTION public.touch_notification_updated_at();

-- 33-35: RLS is mandatory for all notification tables.
ALTER TABLE public.user_notification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

-- 36-43: least-privilege policies. Existing policies with other names remain untouched.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_notification_tokens' AND policyname='notification_tokens_select_own') THEN
    CREATE POLICY notification_tokens_select_own ON public.user_notification_tokens
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_notification_tokens' AND policyname='notification_tokens_insert_own') THEN
    CREATE POLICY notification_tokens_insert_own ON public.user_notification_tokens
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_notification_tokens' AND policyname='notification_tokens_update_own') THEN
    CREATE POLICY notification_tokens_update_own ON public.user_notification_tokens
      FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_notification_tokens' AND policyname='notification_tokens_delete_own') THEN
    CREATE POLICY notification_tokens_delete_own ON public.user_notification_tokens
      FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_notification_preferences' AND policyname='notification_preferences_select_own') THEN
    CREATE POLICY notification_preferences_select_own ON public.user_notification_preferences
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_notification_preferences' AND policyname='notification_preferences_insert_own') THEN
    CREATE POLICY notification_preferences_insert_own ON public.user_notification_preferences
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_notification_preferences' AND policyname='notification_preferences_update_own') THEN
    CREATE POLICY notification_preferences_update_own ON public.user_notification_preferences
      FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notification_logs' AND policyname='notification_logs_select_own') THEN
    CREATE POLICY notification_logs_select_own ON public.notification_logs
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

-- 44-47: server-only audit writes and protected trigger function.
REVOKE INSERT, UPDATE, DELETE ON public.notification_logs FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_notification_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_notification_updated_at() TO service_role;
GRANT SELECT ON public.notification_logs TO authenticated;

COMMIT;
