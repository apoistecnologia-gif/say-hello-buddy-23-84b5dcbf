
-- =========================================================================
-- ENUMS
-- =========================================================================
CREATE TYPE public.app_role AS ENUM ('passenger', 'driver', 'admin');
CREATE TYPE public.ride_category AS ENUM ('carros', 'motos', 'fretes', 'guincho', 'envios');
CREATE TYPE public.driver_approval_status AS ENUM ('pending_approval', 'approved', 'rejected', 'blocked');
CREATE TYPE public.driver_subscription_status AS ENUM ('active', 'inactive', 'overdue');
CREATE TYPE public.ride_status AS ENUM (
  'searching_driver','offered_to_driver','driver_assigned','driver_arrived',
  'in_progress','completed','cancelled','no_driver_available'
);
CREATE TYPE public.payment_status AS ENUM ('pending','paid','failed','refunded');

-- =========================================================================
-- USERS (perfil)
-- =========================================================================
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;
GRANT ALL ON public.users TO service_role;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- USER ROLES (separado por segurança)
-- =========================================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- =========================================================================
-- DRIVERS
-- =========================================================================
CREATE TABLE public.drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  cpf TEXT NOT NULL,
  birth_date DATE,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  category public.ride_category NOT NULL,
  vehicle_model TEXT NOT NULL,
  vehicle_plate TEXT NOT NULL,
  vehicle_color TEXT NOT NULL,
  vehicle_year INTEGER NOT NULL,
  selfie_url TEXT,
  cnh_url TEXT,
  vehicle_document_url TEXT,
  approval_status public.driver_approval_status NOT NULL DEFAULT 'pending_approval',
  subscription_status public.driver_subscription_status NOT NULL DEFAULT 'inactive',
  is_online BOOLEAN NOT NULL DEFAULT false,
  current_lat DOUBLE PRECISION,
  current_lng DOUBLE PRECISION,
  last_location_at TIMESTAMPTZ,
  rating NUMERIC(3,2) NOT NULL DEFAULT 5.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  blocked_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drivers TO authenticated;
GRANT ALL ON public.drivers TO service_role;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_drivers_online_category ON public.drivers (is_online, category, approval_status);
CREATE INDEX idx_drivers_location ON public.drivers (current_lat, current_lng);

-- =========================================================================
-- RIDES
-- =========================================================================
CREATE TABLE public.rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  category public.ride_category NOT NULL,
  origin_name TEXT NOT NULL,
  origin_lat DOUBLE PRECISION NOT NULL,
  origin_lng DOUBLE PRECISION NOT NULL,
  destination_name TEXT NOT NULL,
  destination_lat DOUBLE PRECISION NOT NULL,
  destination_lng DOUBLE PRECISION NOT NULL,
  distance_km NUMERIC(8,2),
  duration_min NUMERIC(8,2),
  estimated_price NUMERIC(10,2),
  final_price NUMERIC(10,2),
  status public.ride_status NOT NULL DEFAULT 'searching_driver',
  current_offer_driver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_driver_ids UUID[] NOT NULL DEFAULT '{}',
  cancel_reason TEXT,
  cancelled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides TO authenticated;
GRANT ALL ON public.rides TO service_role;
ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_rides_status ON public.rides (status);
CREATE INDEX idx_rides_passenger ON public.rides (passenger_id);
CREATE INDEX idx_rides_driver ON public.rides (driver_id);
CREATE INDEX idx_rides_offer ON public.rides (current_offer_driver_id);

-- =========================================================================
-- PAYMENTS
-- =========================================================================
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  method TEXT,
  status public.payment_status NOT NULL DEFAULT 'pending',
  provider_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- SUBSCRIPTIONS (mensalidade do motorista)
-- =========================================================================
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.driver_subscription_status NOT NULL DEFAULT 'inactive',
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  provider_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- NOTIFICATIONS
-- =========================================================================
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- SOS ALERTS
-- =========================================================================
CREATE TABLE public.sos_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ride_id UUID REFERENCES public.rides(id) ON DELETE SET NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  message TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sos_alerts TO authenticated;
GRANT ALL ON public.sos_alerts TO service_role;
ALTER TABLE public.sos_alerts ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- ADMIN SETTINGS (tarifas, configurações globais)
-- =========================================================================
CREATE TABLE public.admin_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_settings TO authenticated;
GRANT ALL ON public.admin_settings TO service_role;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- POLICIES
-- =========================================================================
-- users
CREATE POLICY "users_select_self_or_admin" ON public.users
  FOR SELECT TO authenticated
  USING (auth.uid() = auth_user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "users_insert_self" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = auth_user_id);
CREATE POLICY "users_update_self_or_admin" ON public.users
  FOR UPDATE TO authenticated
  USING (auth.uid() = auth_user_id OR public.has_role(auth.uid(), 'admin'));

-- user_roles: leitura própria + admin; só admin grava
CREATE POLICY "user_roles_select_self_or_admin" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_roles_admin_write" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- drivers
CREATE POLICY "drivers_select_self_or_admin" ON public.drivers
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
-- Passageiros podem ver motoristas online aprovados (para o mapa)
CREATE POLICY "drivers_select_online_for_passengers" ON public.drivers
  FOR SELECT TO authenticated
  USING (is_online = true AND approval_status = 'approved');
CREATE POLICY "drivers_insert_self" ON public.drivers
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "drivers_update_self_or_admin" ON public.drivers
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "drivers_delete_admin" ON public.drivers
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- rides
CREATE POLICY "rides_select_involved_or_admin" ON public.rides
  FOR SELECT TO authenticated
  USING (
    passenger_id = auth.uid()
    OR driver_id = auth.uid()
    OR current_offer_driver_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "rides_insert_passenger" ON public.rides
  FOR INSERT TO authenticated
  WITH CHECK (passenger_id = auth.uid());
CREATE POLICY "rides_update_involved_or_admin" ON public.rides
  FOR UPDATE TO authenticated
  USING (
    passenger_id = auth.uid()
    OR driver_id = auth.uid()
    OR current_offer_driver_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

-- payments
CREATE POLICY "payments_select_self_or_admin" ON public.payments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "payments_insert_self" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "payments_update_admin" ON public.payments
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- subscriptions
CREATE POLICY "subs_select_self_or_admin" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (driver_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "subs_admin_write" ON public.subscriptions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- notifications
CREATE POLICY "notif_select_self" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "notif_update_self" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "notif_insert_self_or_admin" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- sos_alerts
CREATE POLICY "sos_select_self_or_admin" ON public.sos_alerts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "sos_insert_self" ON public.sos_alerts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "sos_update_admin" ON public.sos_alerts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- admin_settings (todos autenticados leem tarifas; só admin grava)
CREATE POLICY "settings_select_all" ON public.admin_settings
  FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "settings_admin_write" ON public.admin_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- TRIGGER updated_at
-- =========================================================================
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_drivers_updated BEFORE UPDATE ON public.drivers FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_rides_updated BEFORE UPDATE ON public.rides FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_subs_updated BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON public.admin_settings FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================================
-- REALTIME
-- =========================================================================
ALTER TABLE public.drivers REPLICA IDENTITY FULL;
ALTER TABLE public.rides REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.drivers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rides;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- =========================================================================
-- AUTO-CRIAR USER + ROLE NO SIGNUP
-- =========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.app_role;
BEGIN
  v_role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'passenger');

  INSERT INTO public.users (auth_user_id, name, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email,
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (auth_user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================================
-- TARIFAS INICIAIS
-- =========================================================================
INSERT INTO public.admin_settings (key, value, description) VALUES
('tariff_carros', '{"base":5.00,"per_km":2.20,"per_min":0.35,"min":8.00}'::jsonb, 'Tarifa de Carros'),
('tariff_motos',  '{"base":3.50,"per_km":1.40,"per_min":0.25,"min":5.00}'::jsonb, 'Tarifa de Motos'),
('tariff_fretes', '{"base":15.00,"per_km":3.50,"cargo_fee":10.00}'::jsonb, 'Tarifa de Fretes'),
('tariff_guincho','{"base":80.00,"per_km":5.00,"removal_fee":50.00}'::jsonb, 'Tarifa de Guincho'),
('tariff_envios', '{"base":6.00,"per_km":1.80,"delivery_fee":3.00}'::jsonb, 'Tarifa de Envios');
