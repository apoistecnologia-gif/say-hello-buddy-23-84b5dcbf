
-- ========== 1. Expand app_settings with new keys (idempotent) ==========
INSERT INTO public.app_settings (key, value, description, category) VALUES
  -- Company
  ('company.name', '"MOVVI DRIVE"'::jsonb, 'Razão social', 'company'),
  ('company.cnpj', '""'::jsonb, 'CNPJ', 'company'),
  ('company.address', '""'::jsonb, 'Endereço', 'company'),
  ('company.support_hours', '"24/7"'::jsonb, 'Horário de atendimento', 'company'),
  -- Google / integrations (non-secret references only)
  ('google.maps_browser_key_name', '"GOOGLE_MAPS_BROWSER_KEY"'::jsonb, 'Nome do secret da chave do navegador', 'integrations'),
  ('google.maps_server_key_name', '"GOOGLE_MAPS_API_KEY"'::jsonb, 'Nome do secret da chave de servidor', 'integrations'),
  ('google.places_enabled', 'true'::jsonb, 'Places API habilitado', 'integrations'),
  ('google.routes_enabled', 'true'::jsonb, 'Routes API habilitado', 'integrations'),
  ('firebase.project_id', '""'::jsonb, 'Firebase Project ID', 'integrations'),
  ('realtime.enabled', 'true'::jsonb, 'Realtime habilitado', 'integrations'),
  -- Operating rules
  ('ride.max_pickup_distance_km', '15'::jsonb, 'Distância máx até embarque (km)', 'operations'),
  ('ride.max_waiting_minutes', '10'::jsonb, 'Tempo máximo de espera (min)', 'operations'),
  ('ride.max_distance_km', '300'::jsonb, 'Distância máxima da corrida (km)', 'operations'),
  ('ride.max_stops', '3'::jsonb, 'Paradas máximas', 'operations'),
  ('ride.max_simultaneous_requests', '1'::jsonb, 'Solicitações simultâneas por passageiro', 'operations'),
  ('passenger.cancellation_grace_sec', '120'::jsonb, 'Tempo p/ cancelar sem multa (s)', 'operations'),
  ('driver.cancellation_grace_sec', '60'::jsonb, 'Tempo motorista p/ cancelar (s)', 'operations'),
  ('pricing.dynamic_enabled', 'true'::jsonb, 'Preço dinâmico', 'operations'),
  ('multiplier.peak_start_hour', '17'::jsonb, 'Início pico', 'operations'),
  ('multiplier.peak_end_hour', '20'::jsonb, 'Fim pico', 'operations'),
  ('multiplier.peak_value', '1.3'::jsonb, 'Multiplicador pico', 'operations'),
  ('multiplier.night_value', '1.2'::jsonb, 'Multiplicador noturno', 'operations'),
  -- Payments
  ('payment.allow_debit_card', 'true'::jsonb, 'Aceitar débito', 'payment'),
  ('payment.allow_wallet', 'true'::jsonb, 'Aceitar carteira', 'payment'),
  ('subscription.grace_days', '3'::jsonb, 'Dias de carência da assinatura', 'payment'),
  ('subscription.auto_suspend', 'true'::jsonb, 'Suspender automaticamente assinaturas vencidas', 'payment'),
  -- Notifications
  ('notifications.push_enabled', 'true'::jsonb, 'Push habilitado', 'notifications'),
  ('notifications.sms_enabled', 'false'::jsonb, 'SMS habilitado', 'notifications'),
  ('notifications.whatsapp_enabled', 'false'::jsonb, 'WhatsApp habilitado', 'notifications'),
  ('notifications.email_enabled', 'true'::jsonb, 'E-mail habilitado', 'notifications')
ON CONFLICT (key) DO NOTHING;

-- ========== 2. payment_gateways ==========
CREATE TABLE IF NOT EXISTS public.payment_gateways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL UNIQUE,
  display_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'sandbox' CHECK (mode IN ('sandbox','live')),
  api_key_secret_name text,
  webhook_url text,
  pix_key text,
  pix_key_type text,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_gateways TO authenticated;
GRANT ALL ON public.payment_gateways TO service_role;
ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_gateways_admin_all" ON public.payment_gateways FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'financial'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'financial'));
CREATE TRIGGER trg_payment_gateways_updated BEFORE UPDATE ON public.payment_gateways
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.payment_gateways (provider, display_name) VALUES
  ('mercadopago','Mercado Pago'),
  ('stripe','Stripe'),
  ('asaas','Asaas'),
  ('pagseguro','PagSeguro')
ON CONFLICT (provider) DO NOTHING;

-- ========== 3. notification_channels ==========
CREATE TABLE IF NOT EXISTS public.notification_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL UNIQUE,
  display_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  credentials_secret_name text,
  from_address text,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_channels TO authenticated;
GRANT ALL ON public.notification_channels TO service_role;
ALTER TABLE public.notification_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_channels_admin_all" ON public.notification_channels FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER trg_notification_channels_updated BEFORE UPDATE ON public.notification_channels
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.notification_channels (channel, display_name, enabled) VALUES
  ('firebase_push','Firebase Push', true),
  ('sms','SMS', false),
  ('whatsapp','WhatsApp', false),
  ('email','E-mail', true)
ON CONFLICT (channel) DO NOTHING;

-- ========== 4. security_settings (singleton) ==========
CREATE TABLE IF NOT EXISTS public.security_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  max_login_attempts integer NOT NULL DEFAULT 5,
  session_timeout_minutes integer NOT NULL DEFAULT 120,
  require_2fa boolean NOT NULL DEFAULT false,
  password_policy jsonb NOT NULL DEFAULT '{"min_length":8,"require_uppercase":true,"require_number":true,"require_symbol":false}'::jsonb,
  audit_logs_enabled boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.security_settings TO authenticated;
GRANT ALL ON public.security_settings TO service_role;
ALTER TABLE public.security_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "security_settings_admin_all" ON public.security_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER trg_security_settings_updated BEFORE UPDATE ON public.security_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.security_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ========== 5. backups ==========
CREATE TABLE IF NOT EXISTS public.backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'manual' CHECK (type IN ('manual','auto')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','success','failed')),
  file_path text,
  size_bytes bigint,
  tables jsonb,
  error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backups TO authenticated;
GRANT ALL ON public.backups TO service_role;
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backups_admin_all" ON public.backups FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- ========== 6. ride_categories: ensure 5 categories exist ==========
INSERT INTO public.ride_categories (key, label, icon, color, enabled, sort_order) VALUES
  ('car','Carro','car','#8DD92B', true, 1),
  ('moto','Moto','bike','#5FAF1A', true, 2),
  ('delivery','Entrega','package','#F59E0B', true, 3),
  ('tow','Guincho','truck','#EF4444', true, 4),
  ('moving','Mudança','truck','#3B82F6', true, 5)
ON CONFLICT (key) DO NOTHING;

-- ========== 7. tariff_rules: full default field set per category ==========
WITH cats AS (
  SELECT unnest(ARRAY['car','moto','delivery','tow','moving']) AS k
),
fields AS (
  SELECT * FROM (VALUES
    ('base_fare', 5.0),
    ('min_fare', 8.0),
    ('per_km', 2.5),
    ('per_minute', 0.35),
    ('waiting_fee_per_min', 0.5),
    ('cancellation_fee', 4.0),
    ('extra_stop_fee', 3.0),
    ('night_multiplier', 1.2),
    ('peak_multiplier', 1.3),
    ('airport_fee', 8.0),
    ('toll_fee', 0.0),
    ('heavy_cargo_fee', 0.0),
    ('helper_fee', 0.0),
    ('stairs_fee', 0.0),
    ('max_weight_kg', 0.0),
    ('max_distance_km', 300.0)
  ) AS t(field_key, val)
)
INSERT INTO public.tariff_rules (category_key, field_key, value)
SELECT cats.k, fields.field_key, fields.val
FROM cats CROSS JOIN fields
ON CONFLICT (category_key, field_key) DO NOTHING;

-- ========== 8. Realtime publication for new tables ==========
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_gateways; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_channels; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.security_settings; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.backups; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.ride_categories; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
