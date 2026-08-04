
-- Passenger emergency contacts (mirrors driver_emergency_contacts)
CREATE TABLE IF NOT EXISTS public.passenger_emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_user_id uuid NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  relation text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.passenger_emergency_contacts TO authenticated;
GRANT ALL ON public.passenger_emergency_contacts TO service_role;

ALTER TABLE public.passenger_emergency_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Passengers manage their own emergency contacts"
  ON public.passenger_emergency_contacts
  FOR ALL
  USING (auth.uid() = passenger_user_id)
  WITH CHECK (auth.uid() = passenger_user_id);

CREATE INDEX IF NOT EXISTS idx_passenger_emergency_contacts_user
  ON public.passenger_emergency_contacts(passenger_user_id);

CREATE TRIGGER trg_passenger_emergency_contacts_updated_at
  BEFORE UPDATE ON public.passenger_emergency_contacts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Incident reports (safety, behavior, route, payment, other)
CREATE TABLE IF NOT EXISTS public.incident_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('driver','passenger')),
  ride_id uuid REFERENCES public.rides(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN ('safety','behavior','route','payment','other')),
  description text,
  status text NOT NULL DEFAULT 'aberto',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.incident_reports TO authenticated;
GRANT ALL ON public.incident_reports TO service_role;

ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own incident reports"
  ON public.incident_reports
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users create own incident reports"
  ON public.incident_reports
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_incident_reports_user ON public.incident_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_incident_reports_ride ON public.incident_reports(ride_id);

CREATE TRIGGER trg_incident_reports_updated_at
  BEFORE UPDATE ON public.incident_reports
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
