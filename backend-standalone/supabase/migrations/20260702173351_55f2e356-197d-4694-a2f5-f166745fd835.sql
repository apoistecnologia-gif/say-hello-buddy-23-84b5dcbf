
-- Extend subscription status enum (idempotent)
ALTER TYPE public.driver_subscription_status ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE public.driver_subscription_status ADD VALUE IF NOT EXISTS 'blocked';
ALTER TYPE public.driver_subscription_status ADD VALUE IF NOT EXISTS 'cancelled';

-- Financial enums
DO $$ BEGIN
  CREATE TYPE public.financial_txn_type AS ENUM (
    'subscription','ride_payment','refund','bonus','adjustment',
    'withdrawal','promotion','future_pix','future_card'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.financial_txn_status AS ENUM (
    'pending','processing','completed','failed','cancelled','refunded'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_method_kind AS ENUM (
    'pix','credit_card','debit_card','cash','wallet','corporate'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.wallet_status AS ENUM ('active','frozen','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Driver wallets
CREATE TABLE IF NOT EXISTS public.driver_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_balance numeric(12,2) NOT NULL DEFAULT 0,
  pending_balance numeric(12,2) NOT NULL DEFAULT 0,
  available_balance numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  wallet_status public.wallet_status NOT NULL DEFAULT 'active',
  last_transaction_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.driver_wallets TO authenticated;
GRANT ALL ON public.driver_wallets TO service_role;
ALTER TABLE public.driver_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallet_select_self_or_admin"
  ON public.driver_wallets FOR SELECT TO authenticated
  USING (driver_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_driver_wallets_updated
  BEFORE UPDATE ON public.driver_wallets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Financial transactions ledger
CREATE TABLE IF NOT EXISTS public.financial_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  passenger_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type public.financial_txn_type NOT NULL,
  status public.financial_txn_status NOT NULL DEFAULT 'pending',
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'BRL',
  method public.payment_method_kind,
  description text,
  reference_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_txn_driver ON public.financial_transactions (driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_txn_type_status ON public.financial_transactions (type, status);
CREATE INDEX IF NOT EXISTS idx_fin_txn_reference ON public.financial_transactions (reference_id);

GRANT SELECT ON public.financial_transactions TO authenticated;
GRANT ALL ON public.financial_transactions TO service_role;
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fin_txn_select_self_or_admin"
  ON public.financial_transactions FOR SELECT TO authenticated
  USING (
    driver_id = auth.uid()
    OR passenger_id = auth.uid()
    OR private.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TRIGGER trg_fin_txn_updated
  BEFORE UPDATE ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed default financial settings (do not overwrite)
INSERT INTO public.app_settings (key, value, description, category) VALUES
  ('finance.monthly_fee', '49.90'::jsonb, 'Assinatura mensal do motorista (BRL)', 'finance'),
  ('finance.currency', '"BRL"'::jsonb, 'Moeda padrão da plataforma', 'finance'),
  ('finance.default_payment_method', '"pix"'::jsonb, 'Método de pagamento padrão', 'finance'),
  ('finance.wallet_enabled', 'true'::jsonb, 'Carteira do motorista habilitada', 'finance'),
  ('finance.withdrawal_enabled', 'false'::jsonb, 'Saques habilitados', 'finance'),
  ('finance.discount_rules', '{}'::jsonb, 'Regras futuras de desconto/cupom', 'finance'),
  ('finance.supported_methods', '["pix","credit_card","debit_card","cash","wallet"]'::jsonb, 'Métodos de pagamento suportados', 'finance')
ON CONFLICT (key) DO NOTHING;
