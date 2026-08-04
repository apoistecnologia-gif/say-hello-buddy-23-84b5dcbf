-- MOVVI round 2 launch hardening.
-- This migration is additive/idempotent and preserves the stabilized ride
-- lifecycle while closing payment, cancellation and duplicate-request gaps.

ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS request_key text,
  ADD COLUMN IF NOT EXISTS dispatch_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS search_expires_at timestamptz;

-- Sanitize legacy duplicates before enforcing the invariants. Keep the most
-- advanced/current ride and close only older conflicting searches without
-- attributing the cancellation to the passenger.
WITH ranked_live_rides AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY passenger_id
      ORDER BY
        CASE status::text
          WHEN 'em_viagem' THEN 1
          WHEN 'motorista_chegou' THEN 2
          WHEN 'motorista_a_caminho' THEN 3
          ELSE 4
        END,
        created_at DESC,
        id DESC
    ) AS position
  FROM public.rides
  WHERE status::text IN (
    'procurar_motorista',
    'motorista_a_caminho',
    'motorista_chegou',
    'em_viagem'
  )
)
UPDATE public.rides
   SET status = 'cancelada_passageiro',
       cancelled_at = COALESCE(cancelled_at, now()),
       cancelled_by = NULL,
       cancel_reason = COALESCE(
         cancel_reason,
         'Solicitação duplicada encerrada durante atualização de segurança.'
       )
 WHERE id IN (
   SELECT id FROM ranked_live_rides WHERE position > 1
 );

-- Old versions could reuse provider identifiers. They remain available in the
-- payment event history; clearing only the duplicate columns lets the new
-- immutable charge identity be enforced safely.
WITH duplicate_references AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY provider_reference
      ORDER BY paid_at DESC NULLS LAST, created_at DESC, id DESC
    ) AS position
  FROM public.subscriptions
  WHERE provider_reference IS NOT NULL
)
UPDATE public.subscriptions
   SET provider_reference = NULL
 WHERE id IN (
   SELECT id FROM duplicate_references WHERE position > 1
 );

WITH duplicate_payments AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY provider_payment_id
      ORDER BY paid_at DESC NULLS LAST, created_at DESC, id DESC
    ) AS position
  FROM public.subscriptions
  WHERE provider_payment_id IS NOT NULL
)
UPDATE public.subscriptions
   SET provider_payment_id = NULL
 WHERE id IN (
   SELECT id FROM duplicate_payments WHERE position > 1
 );

CREATE UNIQUE INDEX IF NOT EXISTS ux_rides_passenger_request_key
  ON public.rides(passenger_id, request_key)
  WHERE request_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_rides_one_live_passenger
  ON public.rides(passenger_id)
  WHERE status::text IN (
    'procurar_motorista',
    'motorista_a_caminho',
    'motorista_chegou',
    'em_viagem'
  );

CREATE UNIQUE INDEX IF NOT EXISTS ux_subscriptions_provider_reference
  ON public.subscriptions(provider_reference)
  WHERE provider_reference IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_subscriptions_provider_payment_id
  ON public.subscriptions(provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.activate_due_scheduled_rides()
RETURNS TABLE(activated_ride_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.rides
     SET status = 'procurar_motorista',
         search_expires_at = scheduled_for + interval '15 minutes',
         request_expires_at = NULL,
         dispatch_attempts = 0,
         updated_at = now()
   WHERE status::text = 'agendada'
     AND scheduled_for IS NOT NULL
     AND scheduled_for <= now() + interval '15 minutes'
  RETURNING id;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_due_scheduled_rides()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_due_scheduled_rides()
  TO service_role;

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
       AND COALESCE(s.period_start, s.paid_at) <= _at
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
     AND COALESCE(period_start, paid_at) <= now()
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

CREATE OR REPLACE FUNCTION public.reverse_cancellation_fee_settlement(
  _fee_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fee public.cancellation_fees%ROWTYPE;
BEGIN
  SELECT * INTO v_fee
    FROM public.cancellation_fees
   WHERE id = _fee_id
   FOR UPDATE;
  IF NOT FOUND OR NOT v_fee.is_paid THEN RETURN; END IF;

  UPDATE public.cancellation_fees
     SET is_paid = false,
         paid_at = NULL
   WHERE id = _fee_id;

  INSERT INTO public.passenger_wallets(
    passenger_id, balance, is_blocked, blocked_reason
  )
  VALUES (
    v_fee.passenger_id,
    -v_fee.fee_amount,
    true,
    'refunded_cancellation_fee'
  )
  ON CONFLICT (passenger_id) DO UPDATE
    SET balance = passenger_wallets.balance - v_fee.fee_amount,
        is_blocked = true,
        blocked_reason = 'refunded_cancellation_fee',
        updated_at = now();

  UPDATE public.driver_wallet_transactions
     SET status = 'cancelled',
         updated_at = now()
   WHERE source_ride_id = v_fee.ride_id
     AND source = 'cancellation_fee'
     AND status IN ('pending', 'available');
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_cancellation_fee_settlement(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_cancellation_fee_settlement(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.apply_cancellation_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seconds integer := NULL;
  v_fee numeric(10,2) := 0;
BEGIN
  IF NEW.status NOT IN ('cancelada_passageiro', 'cancelada_motorista') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.cancelled_at IS NULL THEN NEW.cancelled_at := now(); END IF;

  -- Driver and system cancellations never penalize the passenger.
  IF NEW.status <> 'cancelada_passageiro' THEN RETURN NEW; END IF;
  IF NEW.cancelled_by IS DISTINCT FROM NEW.passenger_id THEN RETURN NEW; END IF;

  IF NEW.accepted_at IS NOT NULL THEN
    v_seconds :=
      EXTRACT(EPOCH FROM (NEW.cancelled_at - NEW.accepted_at))::integer;
  END IF;

  IF NEW.accepted_at IS NOT NULL THEN
    IF OLD.status = 'motorista_chegou' THEN
      v_fee := 5.00;
    ELSIF v_seconds IS NOT NULL AND v_seconds > 180 AND v_seconds <= 300 THEN
      v_fee := 3.00;
    END IF;
  END IF;

  IF v_fee > 0 THEN
    INSERT INTO public.cancellation_fees(
      ride_id, passenger_id, driver_id, cancelled_by, ride_status_at_cancel,
      seconds_since_accept, fee_amount, driver_credit, platform_fee
    )
    VALUES (
      NEW.id, NEW.passenger_id, NEW.driver_id, 'passenger', OLD.status::text,
      v_seconds, v_fee, v_fee, 0
    );

    INSERT INTO public.passenger_wallets(
      passenger_id, balance, is_blocked, blocked_reason
    )
    VALUES (
      NEW.passenger_id, -v_fee, true, 'unpaid_cancellation_fee'
    )
    ON CONFLICT (passenger_id) DO UPDATE
      SET balance = passenger_wallets.balance - v_fee,
          is_blocked = true,
          blocked_reason = 'unpaid_cancellation_fee',
          updated_at = now();

    IF NEW.driver_id IS NOT NULL THEN
      INSERT INTO public.driver_wallet_transactions(
        driver_id, amount, status, source, source_ride_id, description
      )
      VALUES (
        NEW.driver_id, v_fee, 'pending', 'cancellation_fee', NEW.id,
        'Crédito pendente — cancelamento do passageiro'
      );
    END IF;
  END IF;

  UPDATE public.users
     SET cancel_score_30d = cancel_score_30d + 1,
         suspended_until = CASE
           WHEN cancel_score_30d + 1 >= 5 THEN now() + interval '7 days'
           WHEN cancel_score_30d + 1 >= 3 THEN now() + interval '24 hours'
           ELSE suspended_until
         END,
         updated_at = now()
   WHERE auth_user_id = NEW.passenger_id;

  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'completed', 'failed')),
  role text,
  reason text
);

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.account_deletion_requests TO service_role;
