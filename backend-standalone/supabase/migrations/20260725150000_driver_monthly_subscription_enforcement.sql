-- MOVVI Driver monthly subscription enforcement.
-- The payment provider confirms payments through the signed Mercado Pago
-- webhook. Database rules remain the final authority for online eligibility.

DO $block$
DECLARE
  v_plan_id uuid;
BEGIN
  SELECT id
    INTO v_plan_id
    FROM public.subscription_plans
   WHERE enabled = true
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_plan_id IS NULL THEN
    INSERT INTO public.subscription_plans (
      name,
      price,
      promotional_price,
      billing_cycle_days,
      grace_period_days,
      enabled
    )
    VALUES (
      'Plano Motorista MOVVI',
      49.90,
      NULL,
      30,
      0,
      true
    );
  ELSE
    UPDATE public.subscription_plans
       SET name = 'Plano Motorista MOVVI',
           price = 49.90,
           promotional_price = NULL,
           billing_cycle_days = 30,
           grace_period_days = 0,
           enabled = true,
           updated_at = now()
     WHERE id = v_plan_id;
  END IF;
END;
$block$;

-- Keep driver-controlled writes away from billing/approval columns while
-- allowing trusted server-side webhook and migration work.
CREATE OR REPLACE FUNCTION public.prevent_driver_privileged_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.role() IS NULL
     OR auth.role() = 'service_role'
     OR private.has_role(auth.uid(), 'admin'::public.app_role)
     OR private.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
     OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at
     OR NEW.financial_status IS DISTINCT FROM OLD.financial_status
     OR NEW.next_due_date IS DISTINCT FROM OLD.next_due_date
     OR NEW.subscription_value IS DISTINCT FROM OLD.subscription_value
     OR NEW.mercadopago_preapproval_id IS DISTINCT FROM OLD.mercadopago_preapproval_id
     OR NEW.mercadopago_init_point IS DISTINCT FROM OLD.mercadopago_init_point
     OR NEW.last_payment_status IS DISTINCT FROM OLD.last_payment_status
     OR NEW.last_payment_id IS DISTINCT FROM OLD.last_payment_id
     OR NEW.last_invoice_url IS DISTINCT FROM OLD.last_invoice_url
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.motivo_reprovacao IS DISTINCT FROM OLD.motivo_reprovacao THEN
    RAISE EXCEPTION 'driver_privileged_columns_readonly'
      USING ERRCODE = '42501',
            HINT = 'Only the billing service or an administrator may change protected driver fields.';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.prevent_driver_privileged_updates()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.driver_subscription_is_current(
  _driver_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.subscriptions s
     WHERE s.driver_id = _driver_user_id
       AND s.status = 'active'
       AND COALESCE(s.period_start, '-infinity'::timestamptz) <= now()
       AND s.period_end IS NOT NULL
       AND s.period_end > now()
  );
$function$;

REVOKE ALL ON FUNCTION public.driver_subscription_is_current(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.driver_subscription_is_current(uuid)
  TO service_role;

-- Recompute the effective driver status from all billing periods. A renewal
-- paid in advance may coexist with the current paid period without blocking
-- the driver before the current due date.
CREATE OR REPLACE FUNCTION public.sync_driver_subscription_from_subscriptions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_driver_user_id uuid;
  v_current_period_end timestamptz;
  v_paid_through timestamptz;
  v_latest_status public.driver_subscription_status;
  v_latest_period_end timestamptz;
  v_effective_status public.driver_subscription_status;
  v_financial_status public.driver_financial_status;
BEGIN
  v_driver_user_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.driver_id
    ELSE NEW.driver_id
  END;

  SELECT max(s.period_end)
    INTO v_current_period_end
    FROM public.subscriptions s
   WHERE s.driver_id = v_driver_user_id
     AND s.status = 'active'
     AND COALESCE(s.period_start, '-infinity'::timestamptz) <= now()
     AND s.period_end IS NOT NULL
     AND s.period_end > now();

  SELECT max(s.period_end)
    INTO v_paid_through
    FROM public.subscriptions s
   WHERE s.driver_id = v_driver_user_id
     AND s.status = 'active'
     AND s.period_end IS NOT NULL
     AND s.period_end > now();

  SELECT s.status, s.period_end
    INTO v_latest_status, v_latest_period_end
    FROM public.subscriptions s
   WHERE s.driver_id = v_driver_user_id
   ORDER BY s.created_at DESC, s.id DESC
   LIMIT 1;

  IF v_current_period_end IS NOT NULL THEN
    v_effective_status := 'active';
    v_financial_status := 'active';
  ELSIF v_latest_status = 'pending' THEN
    v_effective_status := 'pending';
    v_financial_status := 'pending';
  ELSIF v_latest_status = 'cancelled' THEN
    v_effective_status := 'cancelled';
    v_financial_status := 'cancelled';
  ELSIF v_latest_status IN ('blocked', 'suspended') THEN
    v_effective_status := v_latest_status;
    v_financial_status := 'overdue';
  ELSIF v_latest_status IS NULL OR v_latest_status = 'inactive' THEN
    v_effective_status := 'inactive';
    v_financial_status := 'inactive';
  ELSE
    v_effective_status := 'overdue';
    v_financial_status := 'overdue';
  END IF;

  UPDATE public.drivers d
     SET subscription_status = v_effective_status,
         financial_status = v_financial_status,
         subscription_expires_at = COALESCE(v_paid_through, v_latest_period_end),
         next_due_date = COALESCE(v_paid_through, v_latest_period_end)::date,
         is_online = CASE
           WHEN v_effective_status = 'active' THEN d.is_online
           ELSE false
         END,
         updated_at = now()
   WHERE d.user_id = v_driver_user_id;

  IF v_effective_status <> 'active' THEN
    UPDATE public.driver_public_locations
       SET is_online = false,
           current_lat = NULL,
           current_lng = NULL,
           updated_at = now()
     WHERE user_id = v_driver_user_id;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_driver_financial_status
  ON public.subscriptions;
DROP TRIGGER IF EXISTS trg_sync_driver_subscription
  ON public.subscriptions;
DROP TRIGGER IF EXISTS trg_recompute_driver_subscription
  ON public.subscriptions;

CREATE TRIGGER trg_recompute_driver_subscription
AFTER INSERT OR UPDATE OR DELETE
ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.sync_driver_subscription_from_subscriptions();

REVOKE ALL ON FUNCTION public.sync_driver_subscription_from_subscriptions()
  FROM PUBLIC, anon, authenticated;

-- A direct update to drivers.is_online must never bypass the billing rule.
CREATE OR REPLACE FUNCTION public.enforce_driver_online_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.is_online = true AND (
    NEW.approval_status <> 'aprovado'
    OR NOT public.driver_subscription_is_current(NEW.user_id)
  ) THEN
    NEW.is_online := false;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_driver_online_eligibility
  ON public.drivers;
CREATE TRIGGER trg_enforce_driver_online_eligibility
BEFORE INSERT OR UPDATE OF is_online
ON public.drivers
FOR EACH ROW
EXECUTE FUNCTION public.enforce_driver_online_eligibility();

REVOKE ALL ON FUNCTION public.enforce_driver_online_eligibility()
  FROM PUBLIC, anon, authenticated;

-- The public GPS mirror receives the same protection.
CREATE OR REPLACE FUNCTION public.enforce_public_driver_online_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.is_online = true AND NOT EXISTS (
    SELECT 1
      FROM public.drivers d
     WHERE d.user_id = NEW.user_id
       AND d.approval_status = 'aprovado'
       AND public.driver_subscription_is_current(d.user_id)
  ) THEN
    NEW.is_online := false;
    NEW.current_lat := NULL;
    NEW.current_lng := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_public_driver_online_eligibility
  ON public.driver_public_locations;
CREATE TRIGGER trg_enforce_public_driver_online_eligibility
BEFORE INSERT OR UPDATE OF is_online
ON public.driver_public_locations
FOR EACH ROW
EXECUTE FUNCTION public.enforce_public_driver_online_eligibility();

REVOKE ALL ON FUNCTION public.enforce_public_driver_online_eligibility()
  FROM PUBLIC, anon, authenticated;

-- Atomic endpoint used by the driver app. It returns a reason the UI can show,
-- while the triggers above still protect every other write path.
CREATE OR REPLACE FUNCTION public.set_driver_online(
  _online boolean,
  _lat double precision DEFAULT NULL,
  _lng double precision DEFAULT NULL,
  _heading double precision DEFAULT NULL,
  _speed double precision DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_driver public.drivers%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_driver
    FROM public.drivers
   WHERE user_id = v_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'online', false,
      'reason', 'driver_not_found'
    );
  END IF;

  IF _online = false THEN
    UPDATE public.drivers
       SET is_online = false,
           current_lat = NULL,
           current_lng = NULL,
           last_location_at = v_now,
           updated_at = v_now
     WHERE user_id = v_user_id;

    UPDATE public.driver_public_locations
       SET is_online = false,
           current_lat = NULL,
           current_lng = NULL,
           last_location_at = v_now,
           updated_at = v_now
     WHERE user_id = v_user_id;

    RETURN jsonb_build_object('ok', true, 'online', false);
  END IF;

  IF v_driver.approval_status <> 'aprovado' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'online', false,
      'reason', 'driver_not_approved'
    );
  END IF;

  IF NOT public.driver_subscription_is_current(v_user_id) THEN
    UPDATE public.drivers
       SET is_online = false,
           updated_at = v_now
     WHERE user_id = v_user_id;
    UPDATE public.driver_public_locations
       SET is_online = false,
           current_lat = NULL,
           current_lng = NULL,
           updated_at = v_now
     WHERE user_id = v_user_id;

    RETURN jsonb_build_object(
      'ok', false,
      'online', false,
      'reason', 'subscription_not_current'
    );
  END IF;

  IF _lat IS NULL OR _lng IS NULL
     OR _lat < -90 OR _lat > 90
     OR _lng < -180 OR _lng > 180 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'online', false,
      'reason', 'invalid_location'
    );
  END IF;

  UPDATE public.drivers
     SET is_online = true,
         current_lat = _lat,
         current_lng = _lng,
         current_heading = _heading,
         current_speed = _speed,
         last_location_at = v_now,
         updated_at = v_now
   WHERE user_id = v_user_id;

  INSERT INTO public.driver_public_locations (
    user_id,
    name,
    category,
    vehicle_model,
    vehicle_color,
    current_lat,
    current_lng,
    current_heading,
    current_speed,
    rating,
    photo_url,
    is_online,
    last_location_at,
    updated_at
  )
  VALUES (
    v_driver.user_id,
    v_driver.name,
    v_driver.category::text,
    v_driver.vehicle_model,
    v_driver.vehicle_color,
    _lat,
    _lng,
    _heading,
    _speed,
    v_driver.rating,
    v_driver.photo_url,
    true,
    v_now,
    v_now
  )
  ON CONFLICT (user_id) DO UPDATE
    SET name = EXCLUDED.name,
        category = EXCLUDED.category,
        vehicle_model = EXCLUDED.vehicle_model,
        vehicle_color = EXCLUDED.vehicle_color,
        current_lat = EXCLUDED.current_lat,
        current_lng = EXCLUDED.current_lng,
        current_heading = EXCLUDED.current_heading,
        current_speed = EXCLUDED.current_speed,
        rating = EXCLUDED.rating,
        photo_url = EXCLUDED.photo_url,
        is_online = true,
        last_location_at = EXCLUDED.last_location_at,
        updated_at = EXCLUDED.updated_at;

  RETURN jsonb_build_object(
    'ok', true,
    'online', true,
    'paid_through', v_driver.subscription_expires_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_driver_online(
  boolean,
  double precision,
  double precision,
  double precision,
  double precision
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_driver_online(
  boolean,
  double precision,
  double precision,
  double precision,
  double precision
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auto_suspend_overdue_subscriptions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE public.subscriptions
     SET status = 'expired',
         updated_at = now()
   WHERE status = 'active'
     AND auto_suspend = true
     AND period_end IS NOT NULL
     AND period_end <= now();

  UPDATE public.drivers d
     SET is_online = false,
         subscription_status = CASE
           WHEN d.subscription_status = 'active' THEN 'overdue'
           ELSE d.subscription_status
         END,
         financial_status = CASE
           WHEN d.financial_status = 'active' THEN 'overdue'
           ELSE d.financial_status
         END,
         updated_at = now()
   WHERE d.is_online = true
     AND NOT public.driver_subscription_is_current(d.user_id);

  UPDATE public.driver_public_locations l
     SET is_online = false,
         current_lat = NULL,
         current_lng = NULL,
         updated_at = now()
   WHERE l.is_online = true
     AND NOT public.driver_subscription_is_current(l.user_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.auto_suspend_overdue_subscriptions()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_suspend_overdue_subscriptions()
  TO service_role;

-- Enforce expiration close to real time even if the external renewal job is
-- delayed. The guarded block is compatible with environments without pg_cron.
DO $block$
DECLARE
  v_job_id bigint;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    SELECT jobid
      INTO v_job_id
      FROM cron.job
     WHERE jobname = 'movvi-driver-subscription-enforcement'
     LIMIT 1;

    IF v_job_id IS NOT NULL THEN
      PERFORM cron.unschedule(v_job_id);
    END IF;

    PERFORM cron.schedule(
      'movvi-driver-subscription-enforcement',
      '* * * * *',
      'SELECT public.auto_suspend_overdue_subscriptions();'
    );
  END IF;
END;
$block$;

-- Apply the new source of truth to existing data immediately. Assigning the
-- current status to itself intentionally invokes the recompute trigger.
UPDATE public.subscriptions
   SET status = status
 WHERE id IN (
   SELECT DISTINCT ON (driver_id) id
     FROM public.subscriptions
    ORDER BY driver_id, created_at DESC, id DESC
 );

NOTIFY pgrst, 'reload schema';
