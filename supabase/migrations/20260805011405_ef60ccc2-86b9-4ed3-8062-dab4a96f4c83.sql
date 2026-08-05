CREATE TYPE public.driver_approval_status AS ENUM ('pendente', 'em_analise', 'aprovado', 'rejeitado', 'bloqueado');
CREATE TYPE public.driver_subscription_status AS ENUM ('ativa', 'vencida', 'cancelada', 'teste');
CREATE TYPE public.ride_status AS ENUM (
  'agendada',
  'procurar_motorista',
  'motorista_a_caminho',
  'motorista_chegou',
  'em_viagem',
  'finalizada',
  'cancelada_passageiro',
  'cancelada_motorista'
);
CREATE TYPE public.payment_status AS ENUM ('pendente', 'pago', 'falhou', 'estornado');

-- Grant select on all public tables to authenticated and anon
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- 1. DRIVERS
CREATE TABLE IF NOT EXISTS public.drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  category TEXT NOT NULL,
  vehicle_model TEXT NOT NULL,
  vehicle_plate TEXT NOT NULL,
  vehicle_color TEXT NOT NULL,
  approval_status public.driver_approval_status NOT NULL DEFAULT 'pendente',
  subscription_status public.driver_subscription_status NOT NULL DEFAULT 'vencida',
  is_online BOOLEAN NOT NULL DEFAULT false,
  current_lat DOUBLE PRECISION,
  current_lng DOUBLE PRECISION,
  last_location_at TIMESTAMPTZ,
  rating NUMERIC(3,2) NOT NULL DEFAULT 5.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.drivers TO authenticated;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

-- 2. RIDES (vincular ao auth.users diretamente como o standalone faz)
CREATE TABLE IF NOT EXISTS public.rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.ride_status NOT NULL DEFAULT 'procurar_motorista',
  category TEXT NOT NULL,
  origin_name TEXT NOT NULL,
  origin_lat DOUBLE PRECISION NOT NULL,
  origin_lng DOUBLE PRECISION NOT NULL,
  destination_name TEXT NOT NULL,
  destination_lat DOUBLE PRECISION NOT NULL,
  destination_lng DOUBLE PRECISION NOT NULL,
  origin JSONB NOT NULL,
  destination JSONB NOT NULL,
  intermediates JSONB DEFAULT '[]'::jsonb,
  distance_km NUMERIC(10,2),
  duration_min NUMERIC(10,2),
  estimated_price NUMERIC(10,2),
  final_price NUMERIC(10,2),
  payment_method TEXT NOT NULL,
  service_details JSONB,
  encoded_polyline TEXT,
  cancellation_reason TEXT,
  cancelled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cancellation_fee NUMERIC(10,2),
  driver_name TEXT,
  driver_photo TEXT,
  driver_rating NUMERIC(3,2),
  driver_phone TEXT,
  driver_vehicle_model TEXT,
  driver_vehicle_color TEXT,
  driver_vehicle_plate TEXT,
  driver_latitude DOUBLE PRECISION,
  driver_longitude DOUBLE PRECISION,
  driver_heading DOUBLE PRECISION,
  security_code TEXT,
  share_token TEXT,
  passenger_rating SMALLINT,
  passenger_rating_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  driver_arrived_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE ON public.rides TO authenticated;
ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;

-- 3. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 4. POLICIES
CREATE POLICY "drivers_select_online" ON public.drivers FOR SELECT TO authenticated USING (is_online = true AND approval_status = 'aprovado');
CREATE POLICY "drivers_select_self" ON public.drivers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "drivers_update_self" ON public.drivers FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "rides_select_involved" ON public.rides FOR SELECT TO authenticated USING (passenger_id = auth.uid() OR driver_id = auth.uid());
CREATE POLICY "rides_insert_passenger" ON public.rides FOR INSERT TO authenticated WITH CHECK (passenger_id = auth.uid());
CREATE POLICY "rides_update_involved" ON public.rides FOR UPDATE TO authenticated USING (passenger_id = auth.uid() OR driver_id = auth.uid());

CREATE POLICY "notif_select_self" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notif_update_self" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- 5. REALTIME
ALTER TABLE public.rides REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.rides, public.notifications; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 6. TRIGGER updated_at
CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_drivers_updated BEFORE UPDATE ON public.drivers FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_rides_updated BEFORE UPDATE ON public.rides FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
