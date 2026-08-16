-- APOIS Passageiro — compatibilidade financeira das multas de cancelamento
-- Mantém amount/status como contrato atual e fee_amount/is_paid para o webhook legado.

BEGIN;

ALTER TABLE public.cancellation_fees
  ADD COLUMN IF NOT EXISTS fee_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS mp_payment_id text,
  ADD COLUMN IF NOT EXISTS mp_qr_code text,
  ADD COLUMN IF NOT EXISTS mp_qr_code_base64 text,
  ADD COLUMN IF NOT EXISTS mp_ticket_url text,
  ADD COLUMN IF NOT EXISTS mp_expires_at timestamptz;

UPDATE public.cancellation_fees
SET amount = COALESCE(amount, fee_amount, 0),
    fee_amount = COALESCE(amount, fee_amount, 0),
    status = CASE
      WHEN is_paid OR lower(COALESCE(status, '')) IN ('paid', 'pago', 'settled') THEN 'paid'
      ELSE COALESCE(NULLIF(status, ''), 'pending')
    END,
    is_paid = is_paid OR lower(COALESCE(status, '')) IN ('paid', 'pago', 'settled'),
    paid_at = CASE
      WHEN is_paid OR lower(COALESCE(status, '')) IN ('paid', 'pago', 'settled')
        THEN COALESCE(paid_at, updated_at, now())
      ELSE paid_at
    END;

CREATE OR REPLACE FUNCTION public.sync_cancellation_fee_compatibility()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.amount := COALESCE(NEW.amount, NEW.fee_amount, 0);
  NEW.fee_amount := NEW.amount;

  IF NEW.is_paid OR lower(COALESCE(NEW.status, '')) IN ('paid', 'pago', 'settled') THEN
    NEW.is_paid := true;
    NEW.status := 'paid';
    NEW.paid_at := COALESCE(NEW.paid_at, now());
  ELSE
    NEW.is_paid := false;
    NEW.status := COALESCE(NULLIF(NEW.status, ''), 'pending');
    IF lower(NEW.status) IN ('pending', 'open', 'unpaid') THEN
      NEW.paid_at := NULL;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS cancellation_fees_compatibility_sync
  ON public.cancellation_fees;
CREATE TRIGGER cancellation_fees_compatibility_sync
BEFORE INSERT OR UPDATE ON public.cancellation_fees
FOR EACH ROW
EXECUTE FUNCTION public.sync_cancellation_fee_compatibility();

CREATE INDEX IF NOT EXISTS cancellation_fees_passenger_open_idx
  ON public.cancellation_fees(passenger_id, created_at)
  WHERE status IN ('pending', 'open', 'unpaid');

CREATE UNIQUE INDEX IF NOT EXISTS cancellation_fees_mp_payment_unique
  ON public.cancellation_fees(mp_payment_id)
  WHERE mp_payment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.settle_cancellation_fee(_fee_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _passenger_id uuid;
BEGIN
  UPDATE public.cancellation_fees
  SET status = 'paid',
      is_paid = true,
      paid_at = COALESCE(paid_at, now()),
      updated_at = now()
  WHERE id = _fee_id
  RETURNING passenger_id INTO _passenger_id;

  IF _passenger_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.cancellation_fees
    WHERE passenger_id = _passenger_id
      AND id <> _fee_id
      AND status IN ('pending', 'open', 'unpaid')
      AND COALESCE(is_paid, false) = false
  ) THEN
    UPDATE public.passenger_wallets
    SET is_blocked = false,
        blocked_reason = NULL,
        updated_at = now()
    WHERE passenger_id = _passenger_id
      AND (
        blocked_reason IS NULL
        OR blocked_reason ILIKE 'Multa de cancelamento%'
        OR blocked_reason ILIKE '%multa%cancelamento%'
      );
  END IF;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reverse_cancellation_fee_settlement(_fee_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _passenger_id uuid;
  _amount numeric(10,2);
BEGIN
  UPDATE public.cancellation_fees
  SET status = 'pending',
      is_paid = false,
      paid_at = NULL,
      updated_at = now()
  WHERE id = _fee_id
  RETURNING passenger_id, amount INTO _passenger_id, _amount;

  IF _passenger_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.passenger_wallets
  SET is_blocked = true,
      blocked_reason = format(
        'Multa de cancelamento pendente: R$ %s',
        to_char(COALESCE(_amount, 0), 'FM999999990D00')
      ),
      updated_at = now()
  WHERE passenger_id = _passenger_id;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.settle_cancellation_fee(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reverse_cancellation_fee_settlement(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_cancellation_fee(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_cancellation_fee_settlement(uuid) TO service_role;

COMMIT;
