-- APOIS Passageiro — liquidação atômica e compatibilidade das multas de cancelamento

BEGIN;

ALTER TABLE public.cancellation_fees
  ADD COLUMN IF NOT EXISTS amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS fee_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS value numeric(10,2),
  ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS mp_payment_id text,
  ADD COLUMN IF NOT EXISTS mp_payment_status text,
  ADD COLUMN IF NOT EXISTS mp_qr_code text,
  ADD COLUMN IF NOT EXISTS mp_qr_code_base64 text,
  ADD COLUMN IF NOT EXISTS mp_ticket_url text,
  ADD COLUMN IF NOT EXISTS mp_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.cancellation_fees
SET amount = COALESCE(amount, fee_amount, value, 0),
    fee_amount = COALESCE(fee_amount, amount, value, 0),
    value = COALESCE(value, amount, fee_amount, 0),
    is_paid = COALESCE(is_paid, false)
      OR paid_at IS NOT NULL
      OR lower(COALESCE(status, '')) IN ('paid', 'approved', 'pago'),
    status = CASE
      WHEN COALESCE(is_paid, false)
        OR paid_at IS NOT NULL
        OR lower(COALESCE(status, '')) IN ('paid', 'approved', 'pago')
      THEN 'paid'
      ELSE COALESCE(NULLIF(lower(status), ''), 'pending')
    END,
    updated_at = COALESCE(updated_at, now());

CREATE OR REPLACE FUNCTION public.sync_cancellation_fee_contract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  _amount numeric(10,2);
BEGIN
  _amount := GREATEST(0, COALESCE(NEW.amount, NEW.fee_amount, NEW.value, 0));
  NEW.amount := _amount;
  NEW.fee_amount := _amount;
  NEW.value := _amount;

  IF lower(COALESCE(NEW.status, '')) IN ('paid', 'approved', 'pago') OR NEW.is_paid THEN
    NEW.status := 'paid';
    NEW.is_paid := true;
    NEW.paid_at := COALESCE(NEW.paid_at, now());
  ELSIF lower(COALESCE(NEW.status, '')) IN ('refunded', 'charged_back', 'reversed') THEN
    NEW.is_paid := false;
    NEW.paid_at := NULL;
  ELSE
    NEW.status := COALESCE(NULLIF(lower(NEW.status), ''), 'pending');
    NEW.is_paid := false;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS cancellation_fees_sync_contract ON public.cancellation_fees;
CREATE TRIGGER cancellation_fees_sync_contract
BEFORE INSERT OR UPDATE OF amount, fee_amount, value, status, is_paid, paid_at
ON public.cancellation_fees
FOR EACH ROW
EXECUTE FUNCTION public.sync_cancellation_fee_contract();

CREATE OR REPLACE FUNCTION public.settle_cancellation_fee(_fee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _fee public.cancellation_fees%ROWTYPE;
  _remaining integer;
BEGIN
  SELECT * INTO _fee
  FROM public.cancellation_fees
  WHERE id = _fee_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cancellation_fee_not_found';
  END IF;

  IF NOT COALESCE(_fee.is_paid, false) OR lower(COALESCE(_fee.status, '')) <> 'paid' THEN
    UPDATE public.cancellation_fees
    SET status = 'paid',
        is_paid = true,
        paid_at = COALESCE(paid_at, now()),
        updated_at = now()
    WHERE id = _fee.id;
  END IF;

  SELECT count(*) INTO _remaining
  FROM public.cancellation_fees
  WHERE passenger_id = _fee.passenger_id
    AND id <> _fee.id
    AND NOT COALESCE(is_paid, false)
    AND lower(COALESCE(status, 'pending')) IN ('pending', 'open', 'unpaid');

  IF _remaining = 0 THEN
    UPDATE public.passenger_wallets
    SET is_blocked = false,
        blocked_reason = NULL,
        updated_at = now()
    WHERE passenger_id = _fee.passenger_id;
  ELSE
    UPDATE public.passenger_wallets
    SET is_blocked = true,
        blocked_reason = format('%s multa(s) de cancelamento pendente(s)', _remaining),
        updated_at = now()
    WHERE passenger_id = _fee.passenger_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'fee_id', _fee.id,
    'passenger_id', _fee.passenger_id,
    'remaining_pending_fees', _remaining,
    'wallet_released', _remaining = 0
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.reverse_cancellation_fee_settlement(_fee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _fee public.cancellation_fees%ROWTYPE;
BEGIN
  SELECT * INTO _fee
  FROM public.cancellation_fees
  WHERE id = _fee_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cancellation_fee_not_found';
  END IF;

  UPDATE public.cancellation_fees
  SET status = 'pending',
      is_paid = false,
      paid_at = NULL,
      updated_at = now()
  WHERE id = _fee.id;

  UPDATE public.passenger_wallets
  SET is_blocked = true,
      blocked_reason = 'Pagamento de multa estornado. Regularização necessária.',
      updated_at = now()
  WHERE passenger_id = _fee.passenger_id;

  RETURN jsonb_build_object(
    'ok', true,
    'fee_id', _fee.id,
    'passenger_id', _fee.passenger_id,
    'wallet_released', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.settle_cancellation_fee(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reverse_cancellation_fee_settlement(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_cancellation_fee(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_cancellation_fee_settlement(uuid) TO service_role;

CREATE INDEX IF NOT EXISTS cancellation_fees_passenger_pending_v2_idx
  ON public.cancellation_fees(passenger_id, created_at)
  WHERE NOT is_paid AND lower(COALESCE(status, 'pending')) IN ('pending', 'open', 'unpaid');

COMMIT;
