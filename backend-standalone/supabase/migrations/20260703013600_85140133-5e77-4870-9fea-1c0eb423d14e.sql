
-- 1) Device tokens
CREATE TABLE public.user_notification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  platform text NOT NULL CHECK (platform IN ('web','ios','android')),
  token text NOT NULL,
  endpoint text,
  p256dh text,
  auth_key text,
  user_agent text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);
CREATE INDEX ON public.user_notification_tokens(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notification_tokens TO authenticated;
GRANT ALL ON public.user_notification_tokens TO service_role;
ALTER TABLE public.user_notification_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tokens select" ON public.user_notification_tokens FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own tokens insert" ON public.user_notification_tokens FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own tokens update" ON public.user_notification_tokens FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own tokens delete" ON public.user_notification_tokens FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_user_notification_tokens_updated_at
BEFORE UPDATE ON public.user_notification_tokens
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2) Preferences
CREATE TABLE public.user_notification_preferences (
  user_id uuid PRIMARY KEY,
  ride_updates boolean NOT NULL DEFAULT true,
  ride_requests boolean NOT NULL DEFAULT true,
  payment_reminders boolean NOT NULL DEFAULT true,
  promotions boolean NOT NULL DEFAULT false,
  sound boolean NOT NULL DEFAULT true,
  vibration boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notification_preferences TO authenticated;
GRANT ALL ON public.user_notification_preferences TO service_role;
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prefs all" ON public.user_notification_preferences FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_user_notification_preferences_updated_at
BEFORE UPDATE ON public.user_notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3) Logs
CREATE TABLE public.notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  event text NOT NULL,
  channel text NOT NULL DEFAULT 'web',
  title text,
  body text,
  data jsonb,
  status text NOT NULL DEFAULT 'sent',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.notification_logs(user_id, created_at DESC);
GRANT SELECT, INSERT ON public.notification_logs TO authenticated;
GRANT ALL ON public.notification_logs TO service_role;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own logs select" ON public.notification_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own logs insert" ON public.notification_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
