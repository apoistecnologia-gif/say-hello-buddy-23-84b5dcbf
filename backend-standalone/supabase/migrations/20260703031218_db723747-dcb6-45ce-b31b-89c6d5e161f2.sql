
-- 1) Executive KPIs
CREATE OR REPLACE FUNCTION public.admin_analytics_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
  today_start timestamptz := date_trunc('day', now());
  week_start timestamptz := date_trunc('week', now());
  month_start timestamptz := date_trunc('month', now());
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'drivers_registered', (SELECT COUNT(*) FROM public.drivers),
    'drivers_active', (SELECT COUNT(*) FROM public.drivers WHERE approval_status = 'aprovado'),
    'drivers_online', (SELECT COUNT(*) FROM public.drivers WHERE is_online = true),
    'passengers_registered', (SELECT COUNT(*) FROM public.users),
    'passengers_active', (SELECT COUNT(DISTINCT passenger_id) FROM public.rides WHERE created_at >= now() - interval '30 days'),
    'rides_today', (SELECT COUNT(*) FROM public.rides WHERE created_at >= today_start),
    'rides_week', (SELECT COUNT(*) FROM public.rides WHERE created_at >= week_start),
    'rides_month', (SELECT COUNT(*) FROM public.rides WHERE created_at >= month_start),
    'rides_completed', (SELECT COUNT(*) FROM public.rides WHERE status = 'finalizada'),
    'rides_cancelled', (SELECT COUNT(*) FROM public.rides WHERE status::text LIKE 'cancelada%'),
    'cancellation_rate', (
      SELECT CASE WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE status::text LIKE 'cancelada%') / COUNT(*), 2) END
      FROM public.rides
    ),
    'avg_eta_seconds', (
      SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (accepted_at - created_at))))::int, 0)
      FROM public.rides WHERE accepted_at IS NOT NULL AND created_at >= now() - interval '30 days'
    ),
    'avg_ride_duration_min', (
      SELECT COALESCE(ROUND(AVG(duration_min)::numeric, 1), 0)
      FROM public.rides WHERE status = 'finalizada' AND duration_min IS NOT NULL
    ),
    'avg_ride_distance_km', (
      SELECT COALESCE(ROUND(AVG(distance_km)::numeric, 2), 0)
      FROM public.rides WHERE status = 'finalizada' AND distance_km IS NOT NULL
    ),
    'avg_passenger_rating', (SELECT COALESCE(ROUND(AVG(average_rating)::numeric, 2), 0) FROM public.users WHERE average_rating IS NOT NULL),
    'avg_driver_rating', (SELECT COALESCE(ROUND(AVG(average_rating)::numeric, 2), 0) FROM public.drivers WHERE average_rating IS NOT NULL)
  ) INTO v;
  RETURN v;
END $$;

-- 2) Financial KPIs (MOVVI subscription revenue ONLY)
CREATE OR REPLACE FUNCTION public.admin_analytics_financial()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
  today_start timestamptz := date_trunc('day', now());
  month_start timestamptz := date_trunc('month', now());
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'monthly_fee', 49.90,
    'subs_active', (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'ativa'),
    'subs_overdue', (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'vencida'),
    'subs_pending', (SELECT COUNT(*) FROM public.subscriptions WHERE status = 'pendente'),
    'revenue_today', (
      SELECT COALESCE(SUM(amount), 0)::numeric
      FROM public.subscriptions
      WHERE paid_at IS NOT NULL AND paid_at >= today_start
    ),
    'revenue_this_month', (
      SELECT COALESCE(SUM(amount), 0)::numeric
      FROM public.subscriptions
      WHERE paid_at IS NOT NULL AND paid_at >= month_start
    ),
    'mrr', (
      SELECT COALESCE(SUM(amount), 0)::numeric
      FROM public.subscriptions WHERE status = 'ativa'
    ),
    'expected_monthly_revenue', (
      SELECT COALESCE(SUM(amount), 0)::numeric
      FROM public.subscriptions WHERE status IN ('ativa','pendente')
    ),
    'collection_rate', (
      SELECT CASE WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'ativa') / COUNT(*), 2) END
      FROM public.subscriptions
      WHERE status IN ('ativa','vencida','pendente')
    )
  ) INTO v;
  RETURN v;
END $$;

-- 3) Time series — rides bucketed
CREATE OR REPLACE FUNCTION public.admin_analytics_rides_timeseries(
  _from timestamptz,
  _to timestamptz,
  _bucket text DEFAULT 'day'
)
RETURNS TABLE(bucket timestamptz, total bigint, completed bigint, cancelled bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _bucket NOT IN ('hour','day','week','month') THEN
    RAISE EXCEPTION 'invalid_bucket';
  END IF;
  RETURN QUERY
    SELECT date_trunc(_bucket, r.created_at) AS bucket,
           COUNT(*)::bigint AS total,
           COUNT(*) FILTER (WHERE r.status = 'finalizada')::bigint AS completed,
           COUNT(*) FILTER (WHERE r.status::text LIKE 'cancelada%')::bigint AS cancelled
    FROM public.rides r
    WHERE r.created_at >= _from AND r.created_at < _to
    GROUP BY 1
    ORDER BY 1;
END $$;

-- 4) New users timeseries
CREATE OR REPLACE FUNCTION public.admin_analytics_new_users_timeseries(
  _from timestamptz,
  _to timestamptz,
  _bucket text DEFAULT 'day'
)
RETURNS TABLE(bucket timestamptz, new_passengers bigint, new_drivers bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _bucket NOT IN ('hour','day','week','month') THEN
    RAISE EXCEPTION 'invalid_bucket';
  END IF;
  RETURN QUERY
    WITH p AS (
      SELECT date_trunc(_bucket, created_at) AS b, COUNT(*)::bigint AS n
      FROM public.users WHERE created_at >= _from AND created_at < _to GROUP BY 1
    ), d AS (
      SELECT date_trunc(_bucket, created_at) AS b, COUNT(*)::bigint AS n
      FROM public.drivers WHERE created_at >= _from AND created_at < _to GROUP BY 1
    )
    SELECT COALESCE(p.b, d.b) AS bucket,
           COALESCE(p.n, 0) AS new_passengers,
           COALESCE(d.n, 0) AS new_drivers
    FROM p FULL OUTER JOIN d ON p.b = d.b
    ORDER BY 1;
END $$;

-- 5) Subscription growth timeseries (paid subscriptions per bucket)
CREATE OR REPLACE FUNCTION public.admin_analytics_subscription_growth(
  _from timestamptz,
  _to timestamptz,
  _bucket text DEFAULT 'day'
)
RETURNS TABLE(bucket timestamptz, paid_count bigint, revenue numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _bucket NOT IN ('hour','day','week','month') THEN
    RAISE EXCEPTION 'invalid_bucket';
  END IF;
  RETURN QUERY
    SELECT date_trunc(_bucket, paid_at) AS bucket,
           COUNT(*)::bigint AS paid_count,
           COALESCE(SUM(amount), 0)::numeric AS revenue
    FROM public.subscriptions
    WHERE paid_at IS NOT NULL AND paid_at >= _from AND paid_at < _to
    GROUP BY 1
    ORDER BY 1;
END $$;

-- 6) Geographic — top cities/neighborhoods/origins/destinations
CREATE OR REPLACE FUNCTION public.admin_analytics_top_cities(_limit int DEFAULT 10)
RETURNS TABLE(city text, rides bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT d.city AS city, COUNT(r.*)::bigint AS rides
    FROM public.rides r
    JOIN public.drivers d ON d.user_id = r.driver_id
    WHERE d.city IS NOT NULL
    GROUP BY d.city
    ORDER BY rides DESC
    LIMIT _limit;
END $$;

CREATE OR REPLACE FUNCTION public.admin_analytics_top_places(
  _kind text DEFAULT 'origin',
  _limit int DEFAULT 10
)
RETURNS TABLE(place text, rides bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _kind NOT IN ('origin','destination') THEN
    RAISE EXCEPTION 'invalid_kind';
  END IF;
  IF _kind = 'origin' THEN
    RETURN QUERY
      SELECT origin_name AS place, COUNT(*)::bigint AS rides
      FROM public.rides WHERE origin_name IS NOT NULL
      GROUP BY origin_name ORDER BY rides DESC LIMIT _limit;
  ELSE
    RETURN QUERY
      SELECT destination_name AS place, COUNT(*)::bigint AS rides
      FROM public.rides WHERE destination_name IS NOT NULL
      GROUP BY destination_name ORDER BY rides DESC LIMIT _limit;
  END IF;
END $$;

-- 7) Driver rankings
CREATE OR REPLACE FUNCTION public.admin_analytics_top_drivers(
  _kind text DEFAULT 'rides',
  _limit int DEFAULT 20
)
RETURNS TABLE(driver_id uuid, name text, city text, value numeric, rides_total bigint, rating numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF _kind = 'rides' THEN
    RETURN QUERY
      SELECT d.user_id, d.name, d.city, d.completed_rides::numeric, d.completed_rides::bigint, COALESCE(d.average_rating, d.rating)
      FROM public.drivers d ORDER BY d.completed_rides DESC NULLS LAST LIMIT _limit;
  ELSIF _kind = 'rating' THEN
    RETURN QUERY
      SELECT d.user_id, d.name, d.city, COALESCE(d.average_rating, d.rating)::numeric,
             d.completed_rides::bigint, COALESCE(d.average_rating, d.rating)
      FROM public.drivers d WHERE d.total_ratings >= 5
      ORDER BY COALESCE(d.average_rating, d.rating) DESC NULLS LAST LIMIT _limit;
  ELSIF _kind = 'cancellations' THEN
    RETURN QUERY
      SELECT r.driver_id, dr.name, dr.city, COUNT(*)::numeric, dr.completed_rides::bigint,
             COALESCE(dr.average_rating, dr.rating)
      FROM public.rides r
      JOIN public.drivers dr ON dr.user_id = r.driver_id
      WHERE r.status::text LIKE 'cancelada_motorista%'
      GROUP BY r.driver_id, dr.name, dr.city, dr.completed_rides, dr.average_rating, dr.rating
      ORDER BY 4 DESC LIMIT _limit;
  ELSIF _kind = 'expired' THEN
    RETURN QUERY
      SELECT d.user_id, d.name, d.city,
             EXTRACT(EPOCH FROM (now() - d.subscription_expires_at))/86400::numeric AS value,
             d.completed_rides::bigint,
             COALESCE(d.average_rating, d.rating)
      FROM public.drivers d
      WHERE d.subscription_status IN ('vencida','bloqueada')
      ORDER BY d.subscription_expires_at ASC NULLS LAST LIMIT _limit;
  ELSE
    RAISE EXCEPTION 'invalid_kind';
  END IF;
END $$;

-- 8) Passenger rankings
CREATE OR REPLACE FUNCTION public.admin_analytics_top_passengers(
  _kind text DEFAULT 'rides',
  _limit int DEFAULT 20
)
RETURNS TABLE(user_id uuid, name text, city text, value numeric, rides_total bigint, rating numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF _kind = 'rides' THEN
    RETURN QUERY
      SELECT u.auth_user_id, u.name, u.city, u.completed_rides::numeric, u.completed_rides::bigint, u.average_rating
      FROM public.users u ORDER BY u.completed_rides DESC NULLS LAST LIMIT _limit;
  ELSIF _kind = 'rating' THEN
    RETURN QUERY
      SELECT u.auth_user_id, u.name, u.city, u.average_rating::numeric, u.completed_rides::bigint, u.average_rating
      FROM public.users u WHERE u.total_ratings >= 3
      ORDER BY u.average_rating DESC NULLS LAST LIMIT _limit;
  ELSIF _kind = 'cancellations' THEN
    RETURN QUERY
      SELECT r.passenger_id, u.name, u.city, COUNT(*)::numeric, u.completed_rides::bigint, u.average_rating
      FROM public.rides r
      JOIN public.users u ON u.auth_user_id = r.passenger_id
      WHERE r.status::text LIKE 'cancelada_passageiro%'
      GROUP BY r.passenger_id, u.name, u.city, u.completed_rides, u.average_rating
      ORDER BY 4 DESC LIMIT _limit;
  ELSIF _kind = 'new' THEN
    RETURN QUERY
      SELECT u.auth_user_id, u.name, u.city,
             EXTRACT(EPOCH FROM (now() - u.created_at))/86400::numeric,
             u.completed_rides::bigint, u.average_rating
      FROM public.users u ORDER BY u.created_at DESC LIMIT _limit;
  ELSE
    RAISE EXCEPTION 'invalid_kind';
  END IF;
END $$;

-- Execute grants (functions are SECURITY DEFINER but caller must be able to invoke)
GRANT EXECUTE ON FUNCTION public.admin_analytics_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_financial() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_rides_timeseries(timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_new_users_timeseries(timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_subscription_growth(timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_top_cities(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_top_places(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_top_drivers(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_top_passengers(text, int) TO authenticated;
