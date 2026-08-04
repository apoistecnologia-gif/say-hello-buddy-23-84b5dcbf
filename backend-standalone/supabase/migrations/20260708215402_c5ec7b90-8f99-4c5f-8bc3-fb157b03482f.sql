-- 1. Chave Pix no cadastro do motorista
DO $$ BEGIN
  CREATE TYPE public.pix_key_type AS ENUM ('cpf','cnpj','email','phone','random');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS pix_key text,
  ADD COLUMN IF NOT EXISTS pix_key_type public.pix_key_type,
  ADD COLUMN IF NOT EXISTS pix_holder_name text;

-- 2. Tabela de saques
CREATE TABLE IF NOT EXISTS public.driver_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','paid','failed','cancelled')),
  pix_key text NOT NULL,
  pix_key_type public.pix_key_type NOT NULL,
  pix_holder_name text,
  mp_transfer_id text,
  mp_end_to_end_id text,
  mp_response jsonb,
  failure_reason text,
  wallet_tx_id uuid REFERENCES public.driver_wallet_transactions(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS driver_withdrawals_driver_idx ON public.driver_withdrawals(driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS driver_withdrawals_status_idx ON public.driver_withdrawals(status);

GRANT SELECT, INSERT ON public.driver_withdrawals TO authenticated;
GRANT ALL ON public.driver_withdrawals TO service_role;

ALTER TABLE public.driver_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "driver_withdrawals_select_own"
  ON public.driver_withdrawals FOR SELECT TO authenticated
  USING (auth.uid() = driver_id);

CREATE POLICY "driver_withdrawals_service_all"
  ON public.driver_withdrawals FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS driver_withdrawals_touch ON public.driver_withdrawals;
CREATE TRIGGER driver_withdrawals_touch
  BEFORE UPDATE ON public.driver_withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- 3. RPC solicitar saque
CREATE OR REPLACE FUNCTION public.request_driver_withdrawal(_amount numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _drv record;
  _available numeric := 0;
  _wid uuid;
  _tx_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF _amount IS NULL OR _amount < 20 THEN
    RAISE EXCEPTION 'min_withdrawal_amount' USING HINT = 'Valor mínimo de saque: R$ 20,00';
  END IF;

  SELECT pix_key, pix_key_type, pix_holder_name, name
    INTO _drv
    FROM public.drivers
   WHERE user_id = _uid;

  IF _drv.pix_key IS NULL OR _drv.pix_key_type IS NULL THEN
    RAISE EXCEPTION 'pix_key_missing' USING HINT = 'Cadastre sua chave Pix antes de sacar.';
  END IF;

  SELECT COALESCE(SUM(amount),0) INTO _available
    FROM public.driver_wallet_transactions
   WHERE driver_id = _uid AND status = 'available';

  IF _available < _amount THEN
    RAISE EXCEPTION 'insufficient_balance' USING HINT = 'Saldo disponível insuficiente.';
  END IF;

  INSERT INTO public.driver_wallet_transactions
    (driver_id, amount, status, source, description)
  VALUES
    (_uid, -_amount, 'withdrawn', 'withdrawal', 'Saque Pix solicitado')
  RETURNING id INTO _tx_id;

  INSERT INTO public.driver_withdrawals
    (driver_id, amount, status, pix_key, pix_key_type, pix_holder_name, wallet_tx_id)
  VALUES
    (_uid, _amount, 'pending', _drv.pix_key, _drv.pix_key_type,
     COALESCE(_drv.pix_holder_name, _drv.name), _tx_id)
  RETURNING id INTO _wid;

  RETURN _wid;
END $$;

REVOKE ALL ON FUNCTION public.request_driver_withdrawal(numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.request_driver_withdrawal(numeric) TO authenticated;

-- 4. Marcar pago / falha (service_role)
CREATE OR REPLACE FUNCTION public.mark_driver_withdrawal_paid(
  _withdrawal_id uuid,
  _transfer_id text,
  _end_to_end_id text,
  _response jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.driver_withdrawals
     SET status = 'paid',
         mp_transfer_id = _transfer_id,
         mp_end_to_end_id = _end_to_end_id,
         mp_response = _response,
         paid_at = now(),
         processed_at = COALESCE(processed_at, now())
   WHERE id = _withdrawal_id;
END $$;

REVOKE ALL ON FUNCTION public.mark_driver_withdrawal_paid(uuid,text,text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_driver_withdrawal_paid(uuid,text,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_driver_withdrawal_failed(
  _withdrawal_id uuid,
  _reason text,
  _response jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _w record;
BEGIN
  SELECT * INTO _w FROM public.driver_withdrawals WHERE id = _withdrawal_id;
  IF _w IS NULL THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF _w.status IN ('paid','failed','cancelled') THEN RETURN; END IF;

  UPDATE public.driver_withdrawals
     SET status = 'failed',
         failure_reason = _reason,
         mp_response = _response,
         processed_at = now()
   WHERE id = _withdrawal_id;

  -- Estorna saldo: cria transação positiva available compensando o débito
  INSERT INTO public.driver_wallet_transactions
    (driver_id, amount, status, source, description)
  VALUES
    (_w.driver_id, _w.amount, 'available', 'adjustment',
     'Estorno de saque não realizado: ' || COALESCE(_reason,'erro'));
END $$;

REVOKE ALL ON FUNCTION public.mark_driver_withdrawal_failed(uuid,text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_driver_withdrawal_failed(uuid,text,jsonb) TO service_role;