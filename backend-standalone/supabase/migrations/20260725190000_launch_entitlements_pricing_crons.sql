-- MOVVI launch hardening:
-- one subscription source of truth, server-side driver entitlement, and
-- idempotent authenticated jobs.

CREATE OR REPLACE FUNCTION private.driver_has_current_subscription(
  _driver_user_id uuid,
  _at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.subscriptions s
     WHERE s.driver_id = _driver_user_id
       AND s.status::text = 'active'
       AND s.paid_at IS NOT NULL
       AND s.period_end > _at
  );
$$;

REVOKE ALL ON FUNCTION private.driver_has_current_subscription(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.driver_has_current_subscription(uuid, timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION private.recompute_driver_entitlement(
  _driver_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  current_paid public.subscriptions%ROWTYPE;
  latest public.subscriptions%ROWTYPE;
  latest_status text;
BEGIN
  SELECT *
    INTO current_paid
    FROM public.subscriptions
   WHERE driver_id = _driver_user_id
     AND status::text = 'active'
     AND paid_at IS NOT NULL
     AND period_end > now()
   ORDER BY period_end DESC
   LIMIT 1;

  IF FOUND THEN
    UPDATE public.drivers
       SET subscription_status = 'active',
           financial_status = 'active',
           subscription_expires_at = current_paid.period_end,
           next_due_date = current_paid.period_end::date,
           updated_at = now()
     WHERE user_id = _driver_user_id;
    RETURN;
  END IF;

  SELECT *
    INTO latest
    FROM public.subscriptions
   WHERE driver_id = _driver_user_id
   ORDER BY created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    UPDATE public.drivers
       SET subscription_status = 'inactive',
           financial_status = 'inactive',
           subscription_expires_at = NULL,
           is_online = false,
           updated_at = now()
     WHERE user_id = _driver_user_id;
    RETURN;
  END IF;

  latest_status := latest.status::text;
  UPDATE public.drivers
     SET subscription_status = CASE latest_status
           WHEN 'pending' THEN 'pending'::public.driver_subscription_status
           WHEN 'cancelled' THEN 'cancelled'::public.driver_subscription_status
           WHEN 'blocked' THEN 'blocked'::public.driver_subscription_status
           ELSE 'overdue'::public.driver_subscription_status
         END,
         financial_status = CASE latest_status
           WHEN 'pending' THEN 'pending'::public.driver_financial_status
           WHEN 'cancelled' THEN 'cancelled'::public.driver_financial_status
           ELSE 'overdue'::public.driver_financial_status
         END,
         subscription_expires_at = latest.period_end,
         next_due_date = latest.period_end::date,
         is_online = false,
         updated_at = now()
   WHERE user_id = _driver_user_id;
END;
$$;

REVOKE ALL ON FUNCTION private.recompute_driver_entitlement(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.recompute_driver_entitlement(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.sync_driver_financial_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  PERFORM private.recompute_driver_entitlement(
    COALESCE(NEW.driver_id, OLD.driver_id)
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_driver_subscription_from_subscriptions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  PERFORM private.recompute_driver_entitlement(
    COALESCE(NEW.driver_id, OLD.driver_id)
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_driver_entitlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  has_live_ride boolean;
  requests_online boolean;
  changes_location boolean;
BEGIN
  requests_online := COALESCE(NEW.is_online, false);
  changes_location :=
       NEW.current_lat IS DISTINCT FROM OLD.current_lat
    OR NEW.current_lng IS DISTINCT FROM OLD.current_lng
    OR NEW.last_location_at IS DISTINCT FROM OLD.last_location_at;

  IF NOT requests_online AND NOT changes_location THEN
    RETURN NEW;
  END IF;

  IF requests_online
     AND private.driver_has_current_subscription(NEW.user_id, now()) THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.rides r
     WHERE r.driver_id = NEW.user_id
       AND r.status::text IN (
         'motorista_a_caminho',
         'motorista_chegou',
         'em_viagem'
       )
  ) INTO has_live_ride;

  -- An expiration in the middle of a trip must never interrupt navigation or
  -- safety tracking. It only prevents new online sessions and new rides.
  IF has_live_ride AND changes_location AND NOT requests_online THEN
    RETURN NEW;
  END IF;

  -- Clearing the last public coordinate while going offline must always work.
  IF NOT requests_online
     AND NEW.current_lat IS NULL
     AND NEW.current_lng IS NULL THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'driver_subscription_required'
    USING ERRCODE = '42501',
          HINT = 'A paid active subscription with a future period_end is required.';
END;
$$;

DROP TRIGGER IF EXISTS drivers_enforce_entitlement ON public.drivers;
CREATE TRIGGER drivers_enforce_entitlement
  BEFORE UPDATE OF is_online, current_lat, current_lng, last_location_at
  ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_driver_entitlement();

CREATE OR REPLACE FUNCTION public.accept_ride_as_driver(_ride_id uuid)
RETURNS public.rides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_driver public.drivers%ROWTYPE;
  v_ride public.rides%ROWTYPE;
  v_vehicle text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão do motorista não encontrada.';
  END IF;

  SELECT * INTO v_driver
    FROM public.drivers
   WHERE user_id = v_user;
  IF NOT FOUND OR v_driver.approval_status::text <> 'aprovado' THEN
    RAISE EXCEPTION 'Motorista não aprovado para operar.';
  END IF;
  IF NOT COALESCE(v_driver.is_online, false)
     OR v_driver.current_lat IS NULL
     OR v_driver.current_lng IS NULL
     OR v_driver.last_location_at IS NULL
     OR v_driver.last_location_at < now() - interval '2 minutes' THEN
    RAISE EXCEPTION 'Fique online com o GPS ativo antes de aceitar.';
  END IF;

  SELECT * INTO v_ride
    FROM public.rides
   WHERE id = _ride_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Corrida não encontrada.';
  END IF;

  IF v_ride.driver_id = v_user
     AND v_ride.status::text IN (
       'motorista_a_caminho',
       'motorista_chegou',
       'em_viagem'
     ) THEN
    RETURN v_ride;
  END IF;

  IF NOT private.driver_has_current_subscription(v_user, now()) THEN
    RAISE EXCEPTION 'Mensalidade vencida. Regularize o plano antes de aceitar.';
  END IF;
  IF v_ride.status::text <> 'procurar_motorista'
     OR v_ride.accepted_driver_id IS NOT NULL THEN
    RAISE EXCEPTION 'Corrida não está mais disponível.';
  END IF;
  IF NOT (v_user = ANY(COALESCE(v_ride.candidate_driver_ids, ARRAY[]::uuid[])))
     OR v_user = ANY(COALESCE(v_ride.rejected_driver_ids, ARRAY[]::uuid[])) THEN
    RAISE EXCEPTION 'Esta chamada não está disponível para você.';
  END IF;
  IF v_ride.request_expires_at IS NULL OR v_ride.request_expires_at <= now() THEN
    RAISE EXCEPTION 'A oferta expirou.';
  END IF;

  v_vehicle := nullif(concat_ws(' • ',
    nullif(trim(v_driver.vehicle_color), ''),
    nullif(trim(v_driver.vehicle_model), ''),
    nullif(trim(v_driver.vehicle_plate), '')
  ), '');

  UPDATE public.rides
     SET driver_id = v_user,
         accepted_driver_id = v_user,
         status = 'motorista_a_caminho',
         accepted_at = COALESCE(accepted_at, now()),
         current_offer_driver_id = NULL,
         driver_name = v_driver.name,
         driver_phone = v_driver.phone,
         driver_vehicle = v_vehicle,
         driver_lat = v_driver.current_lat,
         driver_lng = v_driver.current_lng,
         safety_code = COALESCE(
           safety_code,
           (1000 + floor(random() * 9000))::int::text
         ),
         updated_at = now()
   WHERE id = _ride_id
     AND status::text = 'procurar_motorista'
     AND accepted_driver_id IS NULL
   RETURNING * INTO v_ride;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Outro motorista aceitou esta corrida primeiro.';
  END IF;
  RETURN v_ride;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_ride_as_driver(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_ride_as_driver(uuid)
  TO authenticated, service_role;

-- Server-side pricing fields used by the special-service forms.
INSERT INTO public.tariff_rules(category_key, field_key, value) VALUES
  ('fretes', 'helper1_fee', 40),
  ('fretes', 'helper2_fee', 70),
  ('fretes', 'stair_fee', 15),
  ('fretes', 'heavy_furniture_fee', 30),
  ('fretes', 'difficult_access_fee', 25),
  ('fretes', 'assembly_fee', 35),
  ('fretes', 'packing_fee', 30),
  ('guincho', 'accident_fee', 35),
  ('guincho', 'platform_fee', 40),
  ('guincho', 'locked_wheels_fee', 25),
  ('guincho', 'garage_fee', 30),
  ('envios', 'per_kg', 0.50),
  ('envios', 'max_weight_kg', 30)
ON CONFLICT (category_key, field_key) DO NOTHING;

-- Recreate authenticated jobs. CRON_SECRET must exist in Supabase Vault with
-- the same value configured in Render. No secret is stored in source or logs.
DO $jobs$
DECLARE
  existing_job bigint;
  job_command text;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE WARNING 'pg_cron is unavailable; MOVVI jobs were not created';
    RETURN;
  END IF;

  FOR existing_job IN
    SELECT jobid
      FROM cron.job
     WHERE jobname IN (
       'renew-driver-subscriptions-daily',
       'activate-scheduled-rides-minute'
     )
  LOOP
    PERFORM cron.unschedule(existing_job);
  END LOOP;

  job_command := $command$
    SELECT net.http_post(
      url := 'https://movvi-backend-standalone.onrender.com/api/public/hooks/renew-driver-subscriptions',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE((
          SELECT decrypted_secret
            FROM vault.decrypted_secrets
           WHERE name = 'CRON_SECRET'
           ORDER BY created_at DESC
           LIMIT 1
        ), '')
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $command$;
  PERFORM cron.schedule(
    'renew-driver-subscriptions-daily',
    '0 9 * * *',
    job_command
  );

  job_command := $command$
    SELECT net.http_post(
      url := 'https://movvi-backend-standalone.onrender.com/api/public/hooks/activate-scheduled-rides',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE((
          SELECT decrypted_secret
            FROM vault.decrypted_secrets
           WHERE name = 'CRON_SECRET'
           ORDER BY created_at DESC
           LIMIT 1
        ), '')
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $command$;
  PERFORM cron.schedule(
    'activate-scheduled-rides-minute',
    '* * * * *',
    job_command
  );
END;
$jobs$;

NOTIFY pgrst, 'reload schema';
