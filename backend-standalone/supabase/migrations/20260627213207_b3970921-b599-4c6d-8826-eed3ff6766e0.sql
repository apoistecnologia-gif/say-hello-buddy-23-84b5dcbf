
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS block_reason TEXT,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.get_passenger_stats(_user_id UUID)
RETURNS TABLE (
  total_rides BIGINT,
  completed_rides BIGINT,
  cancelled_rides BIGINT,
  total_spent NUMERIC,
  avg_rating NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*) AS total_rides,
    COUNT(*) FILTER (WHERE status::text = 'finalizada') AS completed_rides,
    COUNT(*) FILTER (WHERE status::text LIKE 'cancelada%') AS cancelled_rides,
    COALESCE(SUM(final_price) FILTER (WHERE status::text = 'finalizada'), 0) AS total_spent,
    COALESCE(AVG(passenger_rating) FILTER (WHERE passenger_rating IS NOT NULL), 0) AS avg_rating
  FROM public.rides
  WHERE passenger_id = _user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_passenger_stats(UUID) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.admin_users_meta (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  phone TEXT,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_users_meta TO authenticated;
GRANT ALL ON public.admin_users_meta TO service_role;
ALTER TABLE public.admin_users_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read admin_users_meta" ON public.admin_users_meta;
CREATE POLICY "admins read admin_users_meta" ON public.admin_users_meta
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "super admins manage admin_users_meta" ON public.admin_users_meta;
CREATE POLICY "super admins manage admin_users_meta" ON public.admin_users_meta
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS admin_users_meta_updated_at ON public.admin_users_meta;
CREATE TRIGGER admin_users_meta_updated_at
  BEFORE UPDATE ON public.admin_users_meta
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.app_settings (key, value, description, category) VALUES
  ('payment.allow_cash', 'true'::jsonb, 'Aceitar dinheiro', 'payment'),
  ('payment.allow_pix', 'true'::jsonb, 'Aceitar PIX', 'payment'),
  ('payment.allow_credit_card', 'true'::jsonb, 'Aceitar cartão de crédito', 'payment'),
  ('ride.allow_scheduled', 'false'::jsonb, 'Permitir corridas agendadas', 'ride'),
  ('ride.require_gps', 'true'::jsonb, 'Exigir GPS do motorista', 'ride'),
  ('ride.driver_response_timeout_sec', '15'::jsonb, 'Tempo de resposta do motorista', 'ride'),
  ('ride.max_cancellation_minutes', '5'::jsonb, 'Tempo máximo para cancelar sem multa', 'ride'),
  ('driver.require_approval', 'true'::jsonb, 'Exigir aprovação de motoristas', 'driver'),
  ('promotions.enabled', 'true'::jsonb, 'Habilitar cupons/promoções', 'promotions'),
  ('notifications.enabled', 'true'::jsonb, 'Habilitar notificações', 'notifications')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.tariff_rules (category_key, field_key, value)
SELECT c.key, f.field_key, f.default_value
FROM public.ride_categories c
CROSS JOIN (
  VALUES
    ('max_search_radius_km', 15::numeric),
    ('max_pickup_km', 8::numeric),
    ('max_wait_min', 10::numeric),
    ('max_stops', 3::numeric)
) AS f(field_key, default_value)
ON CONFLICT (category_key, field_key) DO NOTHING;
