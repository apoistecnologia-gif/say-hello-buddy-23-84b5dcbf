
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE TABLE IF NOT EXISTS public.notification_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category text NOT NULL DEFAULT 'system',
  title text NOT NULL,
  body text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_inbox TO authenticated;
GRANT ALL ON public.notification_inbox TO service_role;
ALTER TABLE public.notification_inbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own inbox read" ON public.notification_inbox FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own inbox update" ON public.notification_inbox FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own inbox delete" ON public.notification_inbox FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "service inserts inbox" ON public.notification_inbox FOR INSERT TO service_role WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_inbox_user_created ON public.notification_inbox(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  ride_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tickets read" ON public.support_tickets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own tickets insert" ON public.support_tickets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own tickets update" ON public.support_tickets FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.favorite_drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id uuid NOT NULL,
  driver_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (passenger_id, driver_id)
);
GRANT SELECT, INSERT, DELETE ON public.favorite_drivers TO authenticated;
GRANT ALL ON public.favorite_drivers TO service_role;
ALTER TABLE public.favorite_drivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own favs read" ON public.favorite_drivers FOR SELECT TO authenticated USING (auth.uid() = passenger_id);
CREATE POLICY "own favs insert" ON public.favorite_drivers FOR INSERT TO authenticated WITH CHECK (auth.uid() = passenger_id);
CREATE POLICY "own favs delete" ON public.favorite_drivers FOR DELETE TO authenticated USING (auth.uid() = passenger_id);

CREATE TABLE IF NOT EXISTS public.driver_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id uuid NOT NULL,
  driver_id uuid NOT NULL,
  ride_id uuid,
  reason text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.driver_reports TO authenticated;
GRANT ALL ON public.driver_reports TO service_role;
ALTER TABLE public.driver_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own reports read" ON public.driver_reports FOR SELECT TO authenticated USING (auth.uid() = passenger_id);
CREATE POLICY "own reports insert" ON public.driver_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = passenger_id);
