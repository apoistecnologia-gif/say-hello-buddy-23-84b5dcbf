
-- ============ 1. Passenger wallets ============
CREATE TABLE public.passenger_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NOT NULL UNIQUE,
  balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  blocked_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.passenger_wallets TO authenticated;
GRANT ALL ON public.passenger_wallets TO service_role;
ALTER TABLE public.passenger_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "passenger_wallet_self_read" ON public.passenger_wallets
  FOR SELECT TO authenticated USING (auth.uid() = passenger_id OR private.is_admin(auth.uid()));

CREATE TRIGGER passenger_wallets_updated_at BEFORE UPDATE ON public.passenger_wallets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 2. Driver wallet transactions ============
CREATE TYPE public.driver_wallet_tx_status AS ENUM ('pending','available','withdrawn','cancelled');
CREATE TYPE public.driver_wallet_tx_source AS ENUM ('cancellation_fee','manual_credit','withdrawal','adjustment');

CREATE TABLE public.driver_wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  status public.driver_wallet_tx_status NOT NULL DEFAULT 'pending',
  source public.driver_wallet_tx_source NOT NULL,
  source_ride_id UUID REFERENCES public.rides(id) ON DELETE SET NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  available_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX driver_wallet_tx_driver_idx ON public.driver_wallet_transactions(driver_id, status);
GRANT SELECT ON public.driver_wallet_transactions TO authenticated;
GRANT ALL ON public.driver_wallet_transactions TO service_role;
ALTER TABLE public.driver_wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "driver_wallet_tx_self_read" ON public.driver_wallet_transactions
  FOR SELECT TO authenticated USING (auth.uid() = driver_id OR private.is_admin(auth.uid()));

CREATE TRIGGER driver_wallet_tx_updated_at BEFORE UPDATE ON public.driver_wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 3. Cancellation fees audit ============
CREATE TABLE public.cancellation_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  passenger_id UUID NOT NULL,
  driver_id UUID,
  cancelled_by TEXT NOT NULL, -- 'passenger' | 'driver' | 'system'
  ride_status_at_cancel TEXT NOT NULL,
  seconds_since_accept INTEGER,
  fee_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  driver_credit NUMERIC(10,2) NOT NULL DEFAULT 0,
  platform_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cancellation_fees_passenger_idx ON public.cancellation_fees(passenger_id, created_at DESC);
CREATE INDEX cancellation_fees_driver_idx ON public.cancellation_fees(driver_id, created_at DESC);
GRANT SELECT ON public.cancellation_fees TO authenticated;
GRANT ALL ON public.cancellation_fees TO service_role;
ALTER TABLE public.cancellation_fees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cancellation_fees_involved_read" ON public.cancellation_fees
  FOR SELECT TO authenticated USING (
    auth.uid() = passenger_id OR auth.uid() = driver_id OR private.is_admin(auth.uid())
  );

CREATE TRIGGER cancellation_fees_updated_at BEFORE UPDATE ON public.cancellation_fees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 4. Users: cancel score + suspension ============
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS cancel_score_30d INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;

-- ============ 5. Apply cancellation policy trigger ============
CREATE OR REPLACE FUNCTION public.apply_cancellation_policy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seconds INTEGER := NULL;
  v_fee NUMERIC(10,2) := 0;
  v_driver_credit NUMERIC(10,2) := 0;
  v_platform NUMERIC(10,2) := 0;
  v_who TEXT;
  v_score INTEGER;
BEGIN
  -- only fire on transition into cancelled state
  IF NEW.status NOT IN ('cancelada_passageiro','cancelada_motorista') THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  v_who := CASE WHEN NEW.status = 'cancelada_passageiro' THEN 'passenger' ELSE 'driver' END;

  -- ensure cancelled_at is set
  IF NEW.cancelled_at IS NULL THEN NEW.cancelled_at := now(); END IF;

  IF NEW.accepted_at IS NOT NULL THEN
    v_seconds := EXTRACT(EPOCH FROM (NEW.cancelled_at - NEW.accepted_at))::INTEGER;
  END IF;

  -- Fee policy — only when passenger cancels an accepted ride
  IF v_who = 'passenger' AND NEW.accepted_at IS NOT NULL THEN
    IF OLD.status = 'motorista_chegou' THEN
      v_fee := 5.00; v_driver_credit := 4.00; v_platform := 1.00;
    ELSIF v_seconds IS NOT NULL AND v_seconds > 120 AND v_seconds <= 900 THEN
      v_fee := 3.00; v_driver_credit := 2.50; v_platform := 0.50;
    END IF;
  END IF;

  INSERT INTO public.cancellation_fees(
    ride_id, passenger_id, driver_id, cancelled_by, ride_status_at_cancel,
    seconds_since_accept, fee_amount, driver_credit, platform_fee
  ) VALUES (
    NEW.id, NEW.passenger_id, NEW.driver_id, v_who, OLD.status::text,
    v_seconds, v_fee, v_driver_credit, v_platform
  );

  IF v_fee > 0 THEN
    -- debit passenger wallet
    INSERT INTO public.passenger_wallets(passenger_id, balance, is_blocked, blocked_reason)
    VALUES (NEW.passenger_id, -v_fee, true, 'unpaid_cancellation_fee')
    ON CONFLICT (passenger_id) DO UPDATE
      SET balance = passenger_wallets.balance - v_fee,
          is_blocked = true,
          blocked_reason = 'unpaid_cancellation_fee',
          updated_at = now();

    -- credit driver (pending until passenger pays)
    IF NEW.driver_id IS NOT NULL AND v_driver_credit > 0 THEN
      INSERT INTO public.driver_wallet_transactions(
        driver_id, amount, status, source, source_ride_id, description
      ) VALUES (
        NEW.driver_id, v_driver_credit, 'pending', 'cancellation_fee', NEW.id,
        'Crédito pendente — cancelamento do passageiro'
      );
    END IF;

    -- bump cancel score and suspend if repeat offender
    UPDATE public.users
       SET cancel_score_30d = cancel_score_30d + 1,
           suspended_until = CASE
             WHEN cancel_score_30d + 1 >= 5 THEN now() + interval '7 days'
             WHEN cancel_score_30d + 1 >= 3 THEN now() + interval '24 hours'
             ELSE suspended_until
           END,
           updated_at = now()
     WHERE auth_user_id = NEW.passenger_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_cancellation_policy ON public.rides;
CREATE TRIGGER trg_apply_cancellation_policy
  BEFORE UPDATE OF status ON public.rides
  FOR EACH ROW
  WHEN (NEW.status IN ('cancelada_passageiro','cancelada_motorista'))
  EXECUTE FUNCTION public.apply_cancellation_policy();

-- ============ 6. Function: mark cancellation fee as paid (called after passenger pays) ============
CREATE OR REPLACE FUNCTION public.settle_cancellation_fee(_fee_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_fee public.cancellation_fees%ROWTYPE;
BEGIN
  SELECT * INTO v_fee FROM public.cancellation_fees WHERE id = _fee_id FOR UPDATE;
  IF NOT FOUND OR v_fee.is_paid THEN RETURN; END IF;

  UPDATE public.cancellation_fees SET is_paid = true, paid_at = now() WHERE id = _fee_id;

  -- release passenger wallet block (add back the fee)
  UPDATE public.passenger_wallets
     SET balance = balance + v_fee.fee_amount,
         is_blocked = CASE WHEN balance + v_fee.fee_amount >= 0 THEN false ELSE is_blocked END,
         blocked_reason = CASE WHEN balance + v_fee.fee_amount >= 0 THEN NULL ELSE blocked_reason END,
         updated_at = now()
   WHERE passenger_id = v_fee.passenger_id;

  -- release driver credit
  UPDATE public.driver_wallet_transactions
     SET status = 'available', available_at = now(), updated_at = now()
   WHERE source_ride_id = v_fee.ride_id AND status = 'pending' AND source = 'cancellation_fee';
END;
$$;
