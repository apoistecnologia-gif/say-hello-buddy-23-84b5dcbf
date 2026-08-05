-- 20260806000000_clean_baseline.sql
-- COMPLETE BASELINE FOR APOIS ECOSYSTEM
-- TARGET BACKEND: vqtucstyduxrqjgyigfk
-- ARCHITECTURE: A (Unified UUIDs)

BEGIN;

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUMS
DO $$ BEGIN
    CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user', 'passenger', 'driver', 'super_admin', 'financial', 'operations', 'support', 'readonly');
    CREATE TYPE public.driver_approval_status AS ENUM ('pendente', 'em_analise', 'aprovado', 'rejeitado', 'bloqueado', 'reprovado');
    CREATE TYPE public.driver_subscription_status AS ENUM ('ativa', 'vencida', 'cancelada', 'teste', 'overdue', 'active', 'inactive', 'pending', 'suspended', 'expired', 'blocked');
    CREATE TYPE public.payment_status AS ENUM ('pendente', 'pago', 'falhou', 'estornado', 'approved', 'rejected', 'refunded', 'charged_back', 'cancelled', 'authorized', 'in_process', 'unpaid');
    CREATE TYPE public.ride_status AS ENUM ('agendada', 'procurar_motorista', 'motorista_a_caminho', 'motorista_chegou', 'em_viagem', 'finalizada', 'cancelada_passageiro', 'cancelada_motorista', 'expired');
    CREATE TYPE public.withdrawal_status AS ENUM ('pending', 'processing', 'paid', 'failed', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. TABLES (Core Schema)

CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT,
    email TEXT UNIQUE,
    phone TEXT,
    avatar_url TEXT,
    city TEXT,
    average_rating NUMERIC(3,2) DEFAULT 0,
    total_ratings INTEGER DEFAULT 0,
    completed_rides INTEGER DEFAULT 0,
    cpf TEXT,
    birth_date DATE,
    gender TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    preferences JSONB DEFAULT "{}",
    deleted_at TIMESTAMPTZ,
    auth_user_id UUID,
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
    balance NUMERIC(12,2) DEFAULT 0 CHECK (balance >= 0),
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
    motivo_reprovacao TEXT,
    approved_at TIMESTAMPTZ,
    suspended_at TIMESTAMPTZ,
    payment_status public.payment_status,
    subscription_expires_at TIMESTAMPTZ,
    subscription_grace_days INTEGER DEFAULT 0,
    subscription_admin_note TEXT,
    documents_status TEXT,
    photo_url TEXT,
    selfie_url TEXT,
    cnh_url TEXT,
    cnh_back_url TEXT,
    vehicle_document_url TEXT,
    vehicle_photo_url TEXT,
    insurance_url TEXT,
    pix_key TEXT,
    pix_key_type TEXT,
    pix_holder_name TEXT,
    mercadopago_payer_id TEXT,
    mercadopago_preapproval_id TEXT,
    mercadopago_init_point TEXT,
    asaas_customer_id TEXT,
    asaas_subscription_id TEXT,
    last_invoice_url TEXT,
    cpf TEXT,
    birth_date DATE,
    city TEXT,
    state TEXT,
    current_heading NUMERIC,
    current_speed NUMERIC,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TABLES (Ride & Tariff)

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
    category_key TEXT, -- legacy
    field_key TEXT, -- legacy
    value NUMERIC, -- legacy
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
    request_key UUID UNIQUE, -- Idempotency key
    candidate_driver_ids UUID[],
    offered_driver_ids UUID[],
    current_offer_driver_id UUID,
    request_expires_at TIMESTAMPTZ,
    search_expires_at TIMESTAMPTZ,
    dispatch_attempts INTEGER DEFAULT 0,
    accepted_driver_id UUID REFERENCES public.drivers(id),
    driver_arrived_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    pickup_label TEXT,
    pickup_short_label TEXT,
    pickup_address TEXT,
    pickup_place_id TEXT,
    pickup_source TEXT,
    service_details JSONB,
    scheduled_for TIMESTAMPTZ,
    rejected_driver_ids UUID[]
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
    value NUMERIC(10,2) NOT NULL,
    paid_at TIMESTAMPTZ,
    reason TEXT,
    status TEXT DEFAULT 'pending',
    is_paid BOOLEAN DEFAULT FALSE,
    fee_amount NUMERIC(10,2),
    mp_payment_id TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. TABLES (Mercado Pago & Subscriptions)

CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    billing_cycle_days INTEGER NOT NULL DEFAULT 30,
    promotional_price NUMERIC(10,2),
    grace_period_days INTEGER DEFAULT 0,
    enabled BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID REFERENCES public.drivers(id) ON DELETE CASCADE NOT NULL,
    plan_id UUID REFERENCES public.subscription_plans(id),
    external_subscription_id TEXT UNIQUE,
    status public.driver_subscription_status NOT NULL DEFAULT 'teste',
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,
    grace_until TIMESTAMPTZ,
    amount NUMERIC(10,2),
    paid_at TIMESTAMPTZ,
    provider_reference TEXT,
    provider_payment_id TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.driver_payment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID REFERENCES public.drivers(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    mp_payment_id TEXT UNIQUE, -- MP payment_id
    event_type TEXT NOT NULL,
    status public.payment_status NOT NULL,
    value NUMERIC(10,2) NOT NULL,
    paid_at TIMESTAMPTZ,
    raw_payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payment_webhook_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    provider_event_id TEXT UNIQUE NOT NULL, -- MP event_id
    event_key TEXT UNIQUE,
    request_id TEXT,
    status TEXT NOT NULL, -- processed, error, pending
    detail TEXT,
    raw_payload JSONB,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    ride_updates BOOLEAN DEFAULT TRUE,
    ride_requests BOOLEAN DEFAULT TRUE,
    promotions BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.notification_inbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT,
    category TEXT,
    data JSONB,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.notifications_broadcast (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    body TEXT,
    audience_type TEXT,
    audience_filter JSONB,
    sent_by UUID REFERENCES public.users(id),
    delivery_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.favorite_places (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    lat NUMERIC(10,8) NOT NULL,
    lng NUMERIC(11,8) NOT NULL,
    place_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.recent_places (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    lat NUMERIC(10,8) NOT NULL,
    lng NUMERIC(11,8) NOT NULL,
    place_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.favorite_drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    passenger_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    driver_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(passenger_id, driver_id)
);

CREATE TABLE IF NOT EXISTS public.passenger_emergency_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    passenger_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.driver_emergency_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.driver_amenities (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    has_wifi BOOLEAN DEFAULT FALSE,
    has_ac BOOLEAN DEFAULT TRUE,
    has_charger BOOLEAN DEFAULT FALSE,
    has_water BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.driver_public_locations (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    lat NUMERIC(10,8),
    lng NUMERIC(11,8),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.gps_diagnostics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    event TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. TABLES (Payouts & Admin Audit)

CREATE TABLE IF NOT EXISTS public.driver_withdrawals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID REFERENCES public.drivers(id) ON DELETE CASCADE NOT NULL,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    status public.withdrawal_status NOT NULL DEFAULT 'pending',
    pix_key TEXT,
    pix_key_type TEXT,
    pix_holder_name TEXT,
    external_reference TEXT UNIQUE,
    rejection_reason TEXT,
    idempotency_key UUID UNIQUE,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.users(id),
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id UUID,
    before JSONB,
    after JSONB,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admin_driver_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID REFERENCES public.drivers(id) ON DELETE CASCADE NOT NULL,
    admin_id UUID REFERENCES public.users(id) NOT NULL,
    note TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. TABLES (Notifications & Settings)

CREATE TABLE IF NOT EXISTS public.user_notification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    token TEXT NOT NULL,
    platform TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, token)
);

CREATE TABLE IF NOT EXISTS public.notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    status TEXT NOT NULL, -- sent, failed
    provider_message_id TEXT,
    error_info TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.app_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'requested',
    reason TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Legacy/Admin Support Tables (as referenced in code)
CREATE TABLE IF NOT EXISTS public.coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL, -- percent, fixed
    value NUMERIC(10,2) NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
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

-- 8. FUNCTIONS

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

-- Correct handle_new_user
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

    IF _role_str NOT IN ('passenger', 'driver') THEN 
        _role := 'passenger'::public.app_role; 
    ELSE
        _role := _role_str::public.app_role;
    END IF;

    INSERT INTO public.users (id, name, email, phone)
    VALUES (NEW.id, _name, NEW.email, _phone)
    ON CONFLICT (id) DO UPDATE SET 
        email = EXCLUDED.email, 
        name = EXCLUDED.name,
        phone = COALESCE(EXCLUDED.phone, public.users.phone),
        updated_at = NOW();

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;

    IF _role = 'passenger' THEN
        INSERT INTO public.passenger_wallets (passenger_id)
        VALUES (NEW.id)
        ON CONFLICT (passenger_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

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

-- 9. APPLY TRIGGERS DETERMINISTICALLY
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

-- 10. INDEXES (Optimized for Function Patterns)
CREATE INDEX IF NOT EXISTS idx_rides_passenger_id ON public.rides(passenger_id);
CREATE INDEX IF NOT EXISTS idx_rides_driver_id ON public.rides(driver_id);
CREATE INDEX IF NOT EXISTS idx_rides_status ON public.rides(status);
CREATE INDEX IF NOT EXISTS idx_drivers_is_online ON public.drivers(is_online) WHERE is_online = TRUE;
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_p_wallets_passenger_id ON public.passenger_wallets(passenger_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_driver_id ON public.subscriptions(driver_id);
CREATE INDEX IF NOT EXISTS idx_p_webhook_receipts_event_id ON public.payment_webhook_receipts(provider_event_id);
CREATE INDEX IF NOT EXISTS idx_d_payment_events_provider_id ON public.driver_payment_events(provider_id);
CREATE INDEX IF NOT EXISTS idx_d_withdrawals_driver_id ON public.driver_withdrawals(driver_id);
CREATE INDEX IF NOT EXISTS idx_u_notification_tokens_user_id ON public.user_notification_tokens(user_id);

-- 11. RLS ENABLEMENT
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

-- 12. RLS POLICIES (Hardened)

-- USERS
CREATE POLICY "users_select_own" ON public.users FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "users_update_own" ON public.users FOR UPDATE TO authenticated USING (auth.uid() = id) 
WITH CHECK (auth.uid() = id AND (id = EXCLUDED.id OR id IS NOT DISTINCT FROM EXCLUDED.id));
CREATE POLICY "users_admin_all" ON public.users FOR ALL TO authenticated USING (public.current_user_has_role('admin'));

-- USER_ROLES
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_roles_admin_all" ON public.user_roles FOR ALL TO authenticated USING (public.current_user_has_role('admin'));

-- PASSENGER_WALLETS
CREATE POLICY "passenger_wallets_select_own" ON public.passenger_wallets FOR SELECT TO authenticated USING (auth.uid() = passenger_id);
CREATE POLICY "passenger_wallets_admin_select" ON public.passenger_wallets FOR SELECT TO authenticated USING (public.current_user_has_role('admin'));

-- DRIVERS
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

-- NEW TABLES RLS

-- Subscriptions
CREATE POLICY "subs_select_own" ON public.subscriptions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.drivers WHERE id = driver_id AND user_id = auth.uid()));
CREATE POLICY "subs_admin_all" ON public.subscriptions FOR ALL TO authenticated USING (public.current_user_has_role('admin'));

-- Withdrawals
CREATE POLICY "withdrawals_select_own" ON public.driver_withdrawals FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.drivers WHERE id = driver_id AND user_id = auth.uid()));
CREATE POLICY "withdrawals_admin_all" ON public.driver_withdrawals FOR ALL TO authenticated USING (public.current_user_has_role('admin'));

-- Audit Logs
CREATE POLICY "audit_select_admin" ON public.admin_audit_logs FOR SELECT TO authenticated USING (public.current_user_has_role('admin'));

-- Notification Tokens
CREATE POLICY "tokens_own" ON public.user_notification_tokens FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Account Deletion
CREATE POLICY "deletion_own" ON public.account_deletion_requests FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Reference Tables (Read-Only)
CREATE POLICY "ref_categories_select" ON public.ride_categories FOR SELECT TO authenticated USING (is_active = TRUE);
CREATE POLICY "ref_tariff_select" ON public.tariff_rules FOR SELECT TO authenticated USING (is_active = TRUE);
CREATE POLICY "ref_payment_select" ON public.payment_methods FOR SELECT TO authenticated USING (is_active = TRUE);
CREATE POLICY "ref_admin_all_categories" ON public.ride_categories FOR ALL TO authenticated USING (public.current_user_has_role('admin'));
CREATE POLICY "ref_admin_all_tariff" ON public.tariff_rules FOR ALL TO authenticated USING (public.current_user_has_role('admin'));
CREATE POLICY "ref_admin_all_payment" ON public.payment_methods FOR ALL TO authenticated USING (public.current_user_has_role('admin'));

-- 13. GRANTS
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;

-- Selective profile/operational updates
GRANT UPDATE (name, phone, avatar_url, city) ON public.users TO authenticated;
GRANT UPDATE (is_online, current_lat, current_lng, last_location_at) ON public.drivers TO authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;
GRANT ALL ON public.user_notification_tokens TO authenticated;

COMMIT;

-- 10. INDEXES (Optimized for Edge Functions)
CREATE INDEX IF NOT EXISTS idx_rides_passenger_id ON public.rides(passenger_id);
CREATE INDEX IF NOT EXISTS idx_rides_driver_id ON public.rides(driver_id);
CREATE INDEX IF NOT EXISTS idx_rides_accepted_driver_id ON public.rides(accepted_driver_id);
CREATE INDEX IF NOT EXISTS idx_rides_status ON public.rides(status);
CREATE INDEX IF NOT EXISTS idx_rides_request_key ON public.rides(request_key);
CREATE INDEX IF NOT EXISTS idx_drivers_user_id ON public.drivers(user_id);
CREATE INDEX IF NOT EXISTS idx_drivers_is_online ON public.drivers(is_online) WHERE is_online = TRUE;
CREATE INDEX IF NOT EXISTS idx_drivers_approval_status ON public.drivers(approval_status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_driver_id ON public.subscriptions(driver_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_receipts_event_key ON public.payment_webhook_receipts(event_key);
CREATE INDEX IF NOT EXISTS idx_driver_withdrawals_driver_id ON public.driver_withdrawals(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_withdrawals_status ON public.driver_withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_user_notification_tokens_user_id ON public.user_notification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_user_id ON public.notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_user_id ON public.account_deletion_requests(user_id);
