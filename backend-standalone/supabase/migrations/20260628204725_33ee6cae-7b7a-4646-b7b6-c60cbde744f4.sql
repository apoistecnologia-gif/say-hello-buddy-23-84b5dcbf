
-- Fase 1: Banco do app motorista

-- ============ driver_preferences ============
CREATE TABLE IF NOT EXISTS public.driver_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  push boolean NOT NULL DEFAULT true,
  ride_alerts boolean NOT NULL DEFAULT true,
  sound boolean NOT NULL DEFAULT true,
  vibration boolean NOT NULL DEFAULT true,
  accept_short boolean NOT NULL DEFAULT true,
  accept_long boolean NOT NULL DEFAULT true,
  max_radius_km integer NOT NULL DEFAULT 10 CHECK (max_radius_km BETWEEN 1 AND 50),
  accept_cash boolean NOT NULL DEFAULT true,
  accept_pix boolean NOT NULL DEFAULT true,
  accept_card boolean NOT NULL DEFAULT false,
  theme text NOT NULL DEFAULT 'system' CHECK (theme IN ('light','dark','system')),
  language text NOT NULL DEFAULT 'pt' CHECK (language IN ('pt','en','es')),
  navigation_app text NOT NULL DEFAULT 'internal' CHECK (navigation_app IN ('internal','google','waze')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_preferences TO authenticated;
GRANT ALL ON public.driver_preferences TO service_role;
ALTER TABLE public.driver_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "driver_prefs_self_select" ON public.driver_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "driver_prefs_self_upsert" ON public.driver_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "driver_prefs_self_update" ON public.driver_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "driver_prefs_self_delete" ON public.driver_preferences FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_driver_prefs_updated BEFORE UPDATE ON public.driver_preferences FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ driver_emergency_contacts ============
CREATE TABLE IF NOT EXISTS public.driver_emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  relation text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_emergency_contacts TO authenticated;
GRANT ALL ON public.driver_emergency_contacts TO service_role;
ALTER TABLE public.driver_emergency_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dec_self_all" ON public.driver_emergency_contacts FOR ALL TO authenticated USING (auth.uid() = driver_user_id) WITH CHECK (auth.uid() = driver_user_id);
CREATE TRIGGER trg_dec_updated BEFORE UPDATE ON public.driver_emergency_contacts FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ driver_documents ============
CREATE TABLE IF NOT EXISTS public.driver_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('cnh','crlv','selfie','vehicle_photo','insurance')),
  file_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('approved','pending','rejected','expired')),
  expires_at date,
  rejected_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_driver_docs_driver ON public.driver_documents(driver_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_documents TO authenticated;
GRANT ALL ON public.driver_documents TO service_role;
ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ddocs_self_select" ON public.driver_documents FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_documents.driver_id AND d.user_id = auth.uid())
  OR public.has_role(auth.uid(),'admin')
);
CREATE POLICY "ddocs_admin_write" ON public.driver_documents FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_ddocs_updated BEFORE UPDATE ON public.driver_documents FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ driver_announcements ============
CREATE TABLE IF NOT EXISTS public.driver_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all','approved','online')),
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.driver_announcements TO authenticated;
GRANT ALL ON public.driver_announcements TO service_role;
ALTER TABLE public.driver_announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ann_read" ON public.driver_announcements FOR SELECT TO authenticated USING (active = true AND now() BETWEEN starts_at AND COALESCE(ends_at, now() + interval '100 years'));
CREATE POLICY "ann_admin_write" ON public.driver_announcements FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_ann_updated BEFORE UPDATE ON public.driver_announcements FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ RPCs ============
CREATE OR REPLACE FUNCTION public.get_driver_stats(_user_id uuid, _from timestamptz, _to timestamptz)
RETURNS TABLE(
  earnings numeric,
  trips bigint,
  distance_km numeric,
  ride_minutes numeric,
  avg_fare numeric,
  avg_per_km numeric,
  cancelled bigint,
  acceptance_rate numeric,
  cancellation_rate numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN QUERY
  WITH base AS (
    SELECT * FROM public.rides
    WHERE driver_id = _user_id
      AND created_at >= _from AND created_at < _to
  ),
  fin AS (SELECT * FROM base WHERE status = 'finalizada')
  SELECT
    COALESCE(SUM(f.final_price), 0)::numeric,
    COUNT(f.*)::bigint,
    COALESCE(SUM(f.distance_km),0)::numeric,
    COALESCE(SUM(f.duration_min),0)::numeric,
    COALESCE(AVG(f.final_price),0)::numeric,
    CASE WHEN COALESCE(SUM(f.distance_km),0) > 0 THEN COALESCE(SUM(f.final_price),0)/SUM(f.distance_km) ELSE 0 END::numeric,
    (SELECT COUNT(*) FROM base WHERE status::text LIKE 'cancelada%')::bigint,
    CASE WHEN COUNT(*) FILTER (WHERE TRUE) = 0 THEN 0 ELSE
      (COUNT(*) FILTER (WHERE status NOT IN ('cancelada_motorista')))::numeric / NULLIF(COUNT(*),0) END::numeric,
    CASE WHEN COUNT(*) = 0 THEN 0 ELSE
      (COUNT(*) FILTER (WHERE status::text LIKE 'cancelada%'))::numeric / NULLIF(COUNT(*),0) END::numeric
  FROM fin f, base;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_driver_home_kpis(_user_id uuid)
RETURNS TABLE(
  earnings_today numeric,
  trips_today bigint,
  distance_today numeric,
  rating numeric,
  total_trips bigint,
  acceptance_rate numeric,
  cancellation_rate numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE day_start timestamptz := date_trunc('day', now());
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN QUERY
  SELECT
    COALESCE((SELECT SUM(final_price) FROM rides WHERE driver_id=_user_id AND status='finalizada' AND completed_at >= day_start),0)::numeric,
    COALESCE((SELECT COUNT(*) FROM rides WHERE driver_id=_user_id AND status='finalizada' AND completed_at >= day_start),0)::bigint,
    COALESCE((SELECT SUM(distance_km) FROM rides WHERE driver_id=_user_id AND status='finalizada' AND completed_at >= day_start),0)::numeric,
    COALESCE((SELECT AVG(driver_rating) FROM rides WHERE driver_id=_user_id AND driver_rating IS NOT NULL),0)::numeric,
    COALESCE((SELECT COUNT(*) FROM rides WHERE driver_id=_user_id AND status='finalizada'),0)::bigint,
    CASE WHEN (SELECT COUNT(*) FROM rides WHERE driver_id=_user_id) = 0 THEN 0 ELSE
      (SELECT COUNT(*)::numeric FROM rides WHERE driver_id=_user_id AND status NOT IN ('cancelada_motorista')) /
      NULLIF((SELECT COUNT(*) FROM rides WHERE driver_id=_user_id),0) END,
    CASE WHEN (SELECT COUNT(*) FROM rides WHERE driver_id=_user_id) = 0 THEN 0 ELSE
      (SELECT COUNT(*)::numeric FROM rides WHERE driver_id=_user_id AND status::text LIKE 'cancelada%') /
      NULLIF((SELECT COUNT(*) FROM rides WHERE driver_id=_user_id),0) END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_driver_stats(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_home_kpis(uuid) TO authenticated;
