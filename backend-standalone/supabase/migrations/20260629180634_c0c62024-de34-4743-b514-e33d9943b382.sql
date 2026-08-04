
-- 1) Reescreve políticas que usavam public.has_role para usar private.has_role
DROP POLICY IF EXISTS ride_tips_view ON public.ride_tips;
CREATE POLICY ride_tips_view ON public.ride_tips
  FOR SELECT USING (
    passenger_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.rides r WHERE r.id = ride_tips.ride_id AND r.driver_id = auth.uid())
    OR private.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS support_attach_owner_view ON public.support_ticket_attachments;
CREATE POLICY support_attach_owner_view ON public.support_ticket_attachments
  FOR SELECT USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS support_attach_owner_delete ON public.support_ticket_attachments;
CREATE POLICY support_attach_owner_delete ON public.support_ticket_attachments
  FOR DELETE USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS ddocs_self_select ON public.driver_documents;
CREATE POLICY ddocs_self_select ON public.driver_documents
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = driver_documents.driver_id AND d.user_id = auth.uid())
    OR private.has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS ddocs_admin_write ON public.driver_documents;
CREATE POLICY ddocs_admin_write ON public.driver_documents
  FOR ALL
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS ann_admin_write ON public.driver_announcements;
CREATE POLICY ann_admin_write ON public.driver_announcements
  FOR ALL
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- (ann_read já estava ok, mas garantimos)
DROP POLICY IF EXISTS ann_read ON public.driver_announcements;
CREATE POLICY ann_read ON public.driver_announcements
  FOR SELECT USING (
    active = true
    OR private.has_role(auth.uid(), 'admin'::app_role)
  );

-- 2) Remove a função public.has_role e revoga execução para evitar escalada
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);

-- 3) Remove acesso direto de passageiros a PII completa do motorista
DROP POLICY IF EXISTS drivers_select_for_active_ride_passenger ON public.drivers;

-- 4) Restringe leitura de cupons aos admins (validação por código vai por server function)
DROP POLICY IF EXISTS coupons_read ON public.coupons;
CREATE POLICY coupons_read_admin_only ON public.coupons
  FOR SELECT USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- 5) Reforça rides_update: garante que só admin atualiza por RLS direta
DROP POLICY IF EXISTS rides_update_involved_or_admin ON public.rides;
-- rides_update_admin_only já existe e está correta; não recriar.

-- 6) Funções SECURITY DEFINER no schema public: revogar execução pública/anon
--    e adicionar checagens internas onde aplicável.

-- 6a) auto_suspend_overdue_subscriptions — só admins
CREATE OR REPLACE FUNCTION public.auto_suspend_overdue_subscriptions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.subscriptions s
  SET status='vencida', updated_at=now()
  WHERE s.status='ativa' AND s.auto_suspend=true
    AND s.period_end IS NOT NULL
    AND now() > COALESCE(s.grace_until, s.period_end);

  UPDATE public.drivers d
  SET subscription_status='vencida', updated_at=now()
  FROM public.subscriptions s
  WHERE s.driver_id=d.id AND s.status='vencida' AND d.subscription_status<>'vencida';
END$function$;
REVOKE ALL ON FUNCTION public.auto_suspend_overdue_subscriptions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_suspend_overdue_subscriptions() TO authenticated;

-- 6b) get_driver_home_kpis — só o próprio motorista ou admin
CREATE OR REPLACE FUNCTION public.get_driver_home_kpis(_user_id uuid)
RETURNS TABLE(earnings_today numeric, trips_today bigint, distance_today numeric, rating numeric, total_trips bigint, acceptance_rate numeric, cancellation_rate numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE day_start timestamptz := date_trunc('day', now());
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF auth.uid() <> _user_id AND NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
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
$function$;
REVOKE ALL ON FUNCTION public.get_driver_home_kpis(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_driver_home_kpis(uuid) TO authenticated;

-- 6c) get_driver_stats — só o próprio motorista ou admin
CREATE OR REPLACE FUNCTION public.get_driver_stats(_user_id uuid, _from timestamp with time zone, _to timestamp with time zone)
RETURNS TABLE(earnings numeric, trips bigint, distance_km numeric, ride_minutes numeric, avg_fare numeric, avg_per_km numeric, cancelled bigint, acceptance_rate numeric, cancellation_rate numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF auth.uid() <> _user_id AND NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
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
$function$;
REVOKE ALL ON FUNCTION public.get_driver_stats(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_driver_stats(uuid, timestamptz, timestamptz) TO authenticated;

-- 6d) get_passenger_stats — só o próprio passageiro ou admin
CREATE OR REPLACE FUNCTION public.get_passenger_stats(_user_id uuid)
RETURNS TABLE(total_rides bigint, completed_rides bigint, cancelled_rides bigint, total_spent numeric, avg_rating numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF auth.uid() <> _user_id AND NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT
      COUNT(*) AS total_rides,
      COUNT(*) FILTER (WHERE status::text = 'finalizada') AS completed_rides,
      COUNT(*) FILTER (WHERE status::text LIKE 'cancelada%') AS cancelled_rides,
      COALESCE(SUM(final_price) FILTER (WHERE status::text = 'finalizada'), 0) AS total_spent,
      COALESCE(AVG(passenger_rating) FILTER (WHERE passenger_rating IS NOT NULL), 0) AS avg_rating
    FROM public.rides
    WHERE passenger_id = _user_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_passenger_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_passenger_stats(uuid) TO authenticated;

-- 6e) Trigger functions: revogar EXECUTE público/anon/authenticated (triggers ignoram GRANTs)
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_driver_public_location() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_single_rating() FROM PUBLIC, anon, authenticated;
