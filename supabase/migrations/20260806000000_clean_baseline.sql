-- 20260806000000_clean_baseline.sql
-- COMPLETE BASELINE FOR APOIS ECOSYSTEM
-- TARGET BACKEND: vqtucstyduxrqjgyigfk
-- ARCHITECTURE: A (Unified UUIDs)

BEGIN;

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUMS
DO $$ BEGIN
    CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user', 'passenger', 'driver');
    CREATE TYPE public.driver_approval_status AS ENUM ('pendente', 'em_analise', 'aprovado', 'rejeitado', 'bloqueado');
    CREATE TYPE public.driver_subscription_status AS ENUM ('ativa', 'vencida', 'cancelada', 'teste');
    CREATE TYPE public.payment_status AS ENUM ('pendente', 'pago', 'falhou', 'estornado');
    CREATE TYPE public.ride_status AS ENUM ('agendada', 'procurar_motorista', 'motorista_a_caminho', 'motorista_chegou', 'em_viagem', 'finalizada', 'cancelada_passageiro', 'cancelada_motorista');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. TABLES (Complete Schema)

CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, -- Architecture A: same as auth.users.id
    name TEXT,
    email TEXT UNIQUE,
    phone TEXT,
    avatar_url TEXT,
    city TEXT,
    average_rating NUMERIC(3,2) DEFAULT 0,
    total_ratings INTEGER DEFAULT 0,
    completed_rides INTEGER DEFAULT 0,
    blocked_at TIMESTAMPTZ,
    block_reason TEXT,
    suspended_until TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    role public.app_role NOT NULL,
    UNIQUE(user_id, role)
);

CREATE TABLE IF NOT EXISTS public.passenger_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    passenger_id UUID UNIQUE REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    balance NUMERIC(12,2) DEFAULT 0,
    currency TEXT DEFAULT 'BRL',
    is_blocked BOOLEAN DEFAULT FALSE,
    blocked_reason TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    category TEXT NOT NULL,
    vehicle_plate TEXT NOT NULL,
    vehicle_model TEXT NOT NULL,
    vehicle_color TEXT NOT NULL,
    approval_status public.driver_approval_status DEFAULT 'pendente',
    subscription_status public.driver_subscription_status DEFAULT 'teste',
    is_online BOOLEAN DEFAULT FALSE,
    rating NUMERIC(3,2) DEFAULT 5.0,
    current_lat NUMERIC(10,8),
    current_lng NUMERIC(11,8),
    last_location_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ride_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    image_url TEXT,
    capacity_label TEXT,
    eta_label TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tariff_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES public.ride_categories(id) ON DELETE CASCADE,
    city TEXT DEFAULT 'default',
    base_fare NUMERIC(10,2) NOT NULL DEFAULT 0,
    min_fare NUMERIC(10,2) NOT NULL DEFAULT 0,
    per_km NUMERIC(10,2) NOT NULL DEFAULT 0,
    per_min NUMERIC(10,2) NOT NULL DEFAULT 0,
    stop_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
    fixed_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
    dynamic_multiplier NUMERIC(4,2) DEFAULT 1.0,
    is_active BOOLEAN DEFAULT TRUE,
    valid_from TIMESTAMPTZ,
    valid_to TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(category_id, city)
);

CREATE TABLE IF NOT EXISTS public.rides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    passenger_id UUID REFERENCES public.users(id) NOT NULL,
    driver_id UUID REFERENCES public.drivers(id),
    category TEXT NOT NULL,
    status public.ride_status NOT NULL DEFAULT 'procurar_motorista',
    origin_name TEXT NOT NULL,
    origin_lat NUMERIC(10,8) NOT NULL,
    origin_lng NUMERIC(11,8) NOT NULL,
    destination_name TEXT NOT NULL,
    destination_lat NUMERIC(10,8) NOT NULL,
    destination_lng NUMERIC(11,8) NOT NULL,
    estimated_price NUMERIC(10,2),
    final_price NUMERIC(10,2),
    distance_km NUMERIC(10,2),
    duration_min NUMERIC(10,2),
    payment_method TEXT NOT NULL,
    request_key UUID,
    accepted_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancelled_by TEXT,
    cancellation_reason TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cancellation_fees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id UUID REFERENCES public.rides(id),
    passenger_id UUID REFERENCES public.users(id) NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'pending',
    is_paid BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    data JSONB DEFAULT '{}',
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. FUNCTIONS

-- Hardened Role Helper
CREATE OR REPLACE FUNCTION public.current_user_has_role(_role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = _role
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_has_role(public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_has_role(public.app_role) TO authenticated;

-- Correct handle_new_user (Architecture A, Idempotent, Metadata-Aware)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _name TEXT;
    _phone TEXT;
    _role_str TEXT;
    _role public.app_role;
BEGIN
    _name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Usuário');
    _phone := NEW.raw_user_meta_data->>'phone';
    _role_str := COALESCE(NEW.raw_user_meta_data->>'role', 'passenger');

    -- Role Validation
    IF _role_str NOT IN ('passenger', 'driver') THEN 
        _role := 'passenger'::public.app_role; 
    ELSE
        _role := _role_str::public.app_role;
    END IF;

    -- Upsert Public User (Architecture A: ID = NEW.ID)
    INSERT INTO public.users (id, name, email, phone)
    VALUES (NEW.id, _name, NEW.email, _phone)
    ON CONFLICT (id) DO UPDATE SET 
        email = EXCLUDED.email, 
        name = EXCLUDED.name,
        phone = COALESCE(EXCLUDED.phone, public.users.phone),
        updated_at = NOW();

    -- Insert Role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;

    -- Create Wallet ONLY for Passengers
    IF _role = 'passenger' THEN
        INSERT INTO public.passenger_wallets (passenger_id)
        VALUES (NEW.id)
        ON CONFLICT (passenger_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

-- Safe Trigger Setup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Automatic updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. APPLY TRIGGERS DETERMINISTICALLY
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN 
        SELECT table_name FROM information_schema.columns 
        WHERE column_name = 'updated_at' AND table_schema = 'public'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS tr_updated_at_%I ON public.%I', tbl, tbl);
        EXECUTE format('CREATE TRIGGER tr_updated_at_%I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', tbl, tbl);
    END LOOP;
END $$;

-- RPC for Notifications
CREATE OR REPLACE FUNCTION public.mark_notification_read(_notification_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.notifications
    SET read_at = NOW()
    WHERE id = _notification_id AND user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.mark_notification_read(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(UUID) TO authenticated;

-- 6. INDEXES
CREATE INDEX IF NOT EXISTS idx_rides_passenger_id ON public.rides(passenger_id);
CREATE INDEX IF NOT EXISTS idx_rides_driver_id ON public.rides(driver_id);
CREATE INDEX IF NOT EXISTS idx_rides_status ON public.rides(status);
CREATE INDEX IF NOT EXISTS idx_drivers_is_online ON public.drivers(is_online) WHERE is_online = TRUE;
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);

-- 7. RLS ENABLEMENT
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN 
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    END LOOP;
END $$;

-- 8. RLS POLICIES (Hardened Matrix)

-- USERS
CREATE POLICY "users_select_own" ON public.users FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "users_update_own" ON public.users FOR UPDATE TO authenticated USING (auth.uid() = id) 
WITH CHECK (
    auth.uid() = id AND 
    (id = EXCLUDED.id OR id IS NOT DISTINCT FROM EXCLUDED.id) -- Prevent changing ID
);
CREATE POLICY "users_admin_all" ON public.users FOR ALL TO authenticated USING (public.current_user_has_role('admin'));

-- USER_ROLES
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_roles_admin_all" ON public.user_roles FOR ALL TO authenticated USING (public.current_user_has_role('admin'));

-- PASSENGER_WALLETS
CREATE POLICY "passenger_wallets_select_own" ON public.passenger_wallets FOR SELECT TO authenticated USING (auth.uid() = passenger_id);
CREATE POLICY "passenger_wallets_admin_select" ON public.passenger_wallets FOR SELECT TO authenticated USING (public.current_user_has_role('admin'));

-- DRIVERS (Operational approach: column-level grants used in Section 9)
CREATE POLICY "drivers_select_own" ON public.drivers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "drivers_update_own" ON public.drivers FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "drivers_public_active_select" ON public.drivers FOR SELECT TO authenticated USING (is_online = TRUE AND approval_status = 'aprovado');
CREATE POLICY "drivers_admin_all" ON public.drivers FOR ALL TO authenticated USING (public.current_user_has_role('admin'));

-- RIDES
CREATE POLICY "rides_select_passenger" ON public.rides FOR SELECT TO authenticated USING (auth.uid() = passenger_id);
CREATE POLICY "rides_select_driver" ON public.rides FOR SELECT TO authenticated USING (
    auth.uid() = (SELECT user_id FROM public.drivers WHERE id = driver_id) OR 
    (status = 'procurar_motorista' AND public.current_user_has_role('driver'))
);
CREATE POLICY "rides_admin_all" ON public.rides FOR ALL TO authenticated USING (public.current_user_has_role('admin'));

-- CANCELLATION_FEES
CREATE POLICY "cancellation_fees_select_own" ON public.cancellation_fees FOR SELECT TO authenticated USING (auth.uid() = passenger_id);
CREATE POLICY "cancellation_fees_admin_all" ON public.cancellation_fees FOR ALL TO authenticated USING (public.current_user_has_role('admin'));

-- NOTIFICATIONS
CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) 
WITH CHECK (
    auth.uid() = user_id AND 
    (user_id = EXCLUDED.user_id OR user_id IS NOT DISTINCT FROM EXCLUDED.user_id) AND -- Prevent ownership change
    (title = EXCLUDED.title OR title IS NOT DISTINCT FROM EXCLUDED.title) -- Restricted to read_at conceptually (best handled by RPC)
);

-- REFERENCE TABLES
CREATE POLICY "ref_categories_select" ON public.ride_categories FOR SELECT TO authenticated USING (is_active = TRUE);
CREATE POLICY "ref_tariff_select" ON public.tariff_rules FOR SELECT TO authenticated USING (is_active = TRUE);
CREATE POLICY "ref_payment_select" ON public.payment_methods FOR SELECT TO authenticated USING (is_active = TRUE);
CREATE POLICY "ref_admin_all_categories" ON public.ride_categories FOR ALL TO authenticated USING (public.current_user_has_role('admin'));
CREATE POLICY "ref_admin_all_tariff" ON public.tariff_rules FOR ALL TO authenticated USING (public.current_user_has_role('admin'));
CREATE POLICY "ref_admin_all_payment" ON public.payment_methods FOR ALL TO authenticated USING (public.current_user_has_role('admin'));

-- 9. GRANTS AND COLUMN-LEVEL SECURITY
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- Revoke all table-level write grants from authenticated users by default
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM authenticated;

-- Grant selective SELECT
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;

-- Grant selective UPDATE for USERS (own profile)
GRANT UPDATE (name, phone, avatar_url, city) ON public.users TO authenticated;

-- Grant selective UPDATE for DRIVERS (own operation)
GRANT UPDATE (is_online, current_lat, current_lng, last_location_at) ON public.drivers TO authenticated;

-- Grant selective UPDATE for NOTIFICATIONS (read status)
GRANT UPDATE (read_at) ON public.notifications TO authenticated;

COMMIT;
