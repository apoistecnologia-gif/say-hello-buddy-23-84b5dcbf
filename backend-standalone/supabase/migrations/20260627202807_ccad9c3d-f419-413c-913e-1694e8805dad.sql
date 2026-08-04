
-- helper
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','super_admin','financial','support','operations','readonly')
  )
$$;

-- 2. Ride categories
CREATE TABLE IF NOT EXISTS public.ride_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  icon text NOT NULL DEFAULT 'Car',
  color text NOT NULL DEFAULT '#8DD92B',
  enabled boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ride_categories TO anon, authenticated;
GRANT ALL ON public.ride_categories TO service_role;
ALTER TABLE public.ride_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ride_categories_read" ON public.ride_categories FOR SELECT USING (true);
CREATE POLICY "ride_categories_write" ON public.ride_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER trg_ride_categories_updated BEFORE UPDATE ON public.ride_categories FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3. Tariff rules
CREATE TABLE IF NOT EXISTS public.tariff_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key text NOT NULL REFERENCES public.ride_categories(key) ON DELETE CASCADE,
  field_key text NOT NULL,
  value numeric NOT NULL DEFAULT 0,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(category_key, field_key)
);
GRANT SELECT ON public.tariff_rules TO anon, authenticated;
GRANT ALL ON public.tariff_rules TO service_role;
ALTER TABLE public.tariff_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tariff_rules_read" ON public.tariff_rules FOR SELECT USING (true);
CREATE POLICY "tariff_rules_write" ON public.tariff_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'financial'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'financial'));
CREATE TRIGGER trg_tariff_rules_updated BEFORE UPDATE ON public.tariff_rules FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX IF NOT EXISTS idx_tariff_rules_cat ON public.tariff_rules(category_key);

-- 4. App settings
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_settings_read" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "app_settings_write" ON public.app_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER trg_app_settings_updated BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 5. Coupons
CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text,
  type text NOT NULL CHECK (type IN ('percentage','fixed','first_ride','free_delivery')),
  value numeric NOT NULL DEFAULT 0,
  max_discount numeric,
  valid_from timestamptz,
  valid_to timestamptz,
  usage_limit int,
  used_count int NOT NULL DEFAULT 0,
  scope_category text,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coupons_read" ON public.coupons FOR SELECT TO authenticated USING (true);
CREATE POLICY "coupons_write" ON public.coupons FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER trg_coupons_updated BEFORE UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  ride_id uuid,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.coupon_redemptions TO authenticated;
GRANT ALL ON public.coupon_redemptions TO service_role;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "redemptions_read" ON public.coupon_redemptions FOR SELECT TO authenticated
  USING (auth.uid()=user_id OR public.is_admin(auth.uid()));
CREATE POLICY "redemptions_insert" ON public.coupon_redemptions FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id);

-- 6. Subscription plans
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric NOT NULL,
  promotional_price numeric,
  billing_cycle_days int NOT NULL DEFAULT 30,
  grace_period_days int NOT NULL DEFAULT 3,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_plans TO anon, authenticated;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_read" ON public.subscription_plans FOR SELECT USING (true);
CREATE POLICY "plans_write" ON public.subscription_plans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'financial'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'financial'));
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON public.subscription_plans FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.subscription_plans(id);
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS grace_until timestamptz;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS auto_suspend boolean NOT NULL DEFAULT true;

-- 7. Broadcasts
CREATE TABLE IF NOT EXISTS public.notifications_broadcast (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  audience_type text NOT NULL CHECK (audience_type IN ('all','drivers','passengers','city','category','driver','passenger')),
  audience_filter jsonb,
  sent_by uuid,
  sent_at timestamptz NOT NULL DEFAULT now(),
  delivery_count int NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT ON public.notifications_broadcast TO authenticated;
GRANT ALL ON public.notifications_broadcast TO service_role;
ALTER TABLE public.notifications_broadcast ENABLE ROW LEVEL SECURITY;
CREATE POLICY "broadcast_read" ON public.notifications_broadcast FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "broadcast_insert" ON public.notifications_broadcast FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'operations'));

-- 8. Audit
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  before jsonb,
  after jsonb,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.admin_audit_logs TO authenticated;
GRANT ALL ON public.admin_audit_logs TO service_role;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_read" ON public.admin_audit_logs FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "audit_insert" ON public.admin_audit_logs FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.admin_audit_logs(entity, entity_id);

CREATE TABLE IF NOT EXISTS public.admin_login_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text,
  ip text,
  user_agent text,
  success boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.admin_login_history TO authenticated;
GRANT ALL ON public.admin_login_history TO service_role;
ALTER TABLE public.admin_login_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "login_history_read" ON public.admin_login_history FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "login_history_insert" ON public.admin_login_history FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_login_history_created ON public.admin_login_history(created_at DESC);

-- 9. Extensions
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS waypoints jsonb;
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS coupon_id uuid REFERENCES public.coupons(id);
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS surge_multiplier numeric NOT NULL DEFAULT 1;
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS night_multiplier numeric NOT NULL DEFAULT 1;
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS fare_breakdown jsonb;
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS route_polyline text;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS blocked_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS city text;

ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS insurance_url text;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS vehicle_photo_url text;

CREATE INDEX IF NOT EXISTS idx_rides_status_created ON public.rides(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rides_driver ON public.rides(driver_id);
CREATE INDEX IF NOT EXISTS idx_rides_passenger ON public.rides(passenger_id);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON public.drivers(approval_status, is_online);
CREATE INDEX IF NOT EXISTS idx_subs_status ON public.subscriptions(status, period_end);

-- 10. Realtime
DO $$
BEGIN
  PERFORM 1 FROM pg_publication WHERE pubname='supabase_realtime';
  IF FOUND THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.ride_categories; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.tariff_rules; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications_broadcast; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.coupons; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.subscription_plans; EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END$$;

-- 11. Auto-suspend
CREATE OR REPLACE FUNCTION public.auto_suspend_overdue_subscriptions()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.subscriptions s
  SET status='vencida', updated_at=now()
  WHERE s.status='ativa' AND s.auto_suspend=true
    AND s.period_end IS NOT NULL
    AND now() > COALESCE(s.grace_until, s.period_end);

  UPDATE public.drivers d
  SET subscription_status='vencida', updated_at=now()
  FROM public.subscriptions s
  WHERE s.driver_id=d.id AND s.status='vencida' AND d.subscription_status<>'vencida';
END$$;

-- 12. Seeds
INSERT INTO public.ride_categories (key,label,icon,color,sort_order) VALUES
  ('carros','Carros','Car','#8DD92B',1),
  ('motos','Motos','Bike','#5FAF1A',2),
  ('fretes','Fretes','Box','#8DD92B',3),
  ('guincho','Guincho','Truck','#5FAF1A',4),
  ('envios','Envios','Send','#8DD92B',5)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.tariff_rules (category_key, field_key, value) VALUES
  ('carros','base_fare',6),('carros','min_fare',8),('carros','per_km',2.4),('carros','per_min',0.35),
  ('carros','free_waiting_min',3),('carros','wait_per_min',0.5),('carros','cancellation_fee',5),
  ('carros','night_multiplier',1.2),('carros','peak_multiplier',1.3),('carros','airport_fee',8),
  ('carros','toll_fee',0),('carros','extra_stop_fee',3),
  ('motos','base_fare',3.5),('motos','min_fare',5),('motos','per_km',1.4),('motos','per_min',0.2),
  ('motos','wait_per_min',0.3),('motos','cancellation_fee',3),('motos','peak_multiplier',1.2),
  ('fretes','base_fare',12),('fretes','min_fare',18),('fretes','per_km',3.2),('fretes','per_min',0.5),
  ('fretes','max_weight_kg',300),('fretes','extra_stop_fee',5),('fretes','wait_per_min',0.6),
  ('guincho','call_out_fee',80),('guincho','per_km',5.5),('guincho','night_fee',30),
  ('guincho','heavy_vehicle_fee',50),('guincho','difficult_access_fee',40),('guincho','toll_fee',0),
  ('envios','base_fare',8),('envios','per_km',2.0),('envios','hourly_rate',60),
  ('envios','helper1_fee',40),('envios','helper2_fee',70),('envios','stair_fee',15),('envios','heavy_furniture_fee',30)
ON CONFLICT (category_key, field_key) DO NOTHING;

INSERT INTO public.app_settings (key,value,category,description) VALUES
  ('platform.name','"MOVVI DRIVE"','general','Nome da plataforma'),
  ('support.phone','"+5500000000000"','support','Telefone de suporte'),
  ('support.email','"suporte@movvi.app"','support','E-mail de suporte'),
  ('support.whatsapp','"+5500000000000"','support','WhatsApp de suporte'),
  ('legal.privacy_url','""','legal','URL da Política de Privacidade'),
  ('legal.terms_url','""','legal','URL dos Termos de Serviço'),
  ('map.max_driver_distance_km','15','map','Distância máxima de busca de motorista'),
  ('map.auto_search_radius_km','[3,8,15,30,50]','map','Raios progressivos de despacho'),
  ('ride.request_timeout_sec','30','ride','Timeout de oferta por motorista'),
  ('currency.code','"BRL"','general','Moeda'),
  ('country.code','"BR"','general','País'),
  ('timezone','"America/Sao_Paulo"','general','Fuso horário'),
  ('multiplier.night_start_hour','22','pricing','Início do horário noturno'),
  ('multiplier.night_end_hour','6','pricing','Fim do horário noturno'),
  ('subscription.default_plan_price','99.90','subscription','Preço padrão de assinatura mensal')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.subscription_plans (name,price,billing_cycle_days,grace_period_days)
SELECT 'Mensal Padrão', 99.90, 30, 3
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_plans);
