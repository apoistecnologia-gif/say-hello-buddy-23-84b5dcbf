
-- 1. Create payment_methods table
CREATE TABLE public.payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    requires_balance BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;
GRANT SELECT ON public.payment_methods TO anon;

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can select active payment methods" 
ON public.payment_methods FOR SELECT 
USING (is_active = true);

-- 2. Create passenger_wallets table
CREATE TABLE public.passenger_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    passenger_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    balance DECIMAL(12,2) DEFAULT 0.00,
    currency TEXT DEFAULT 'BRL',
    is_blocked BOOLEAN DEFAULT false,
    blocked_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT ON public.passenger_wallets TO authenticated;
GRANT ALL ON public.passenger_wallets TO service_role;

ALTER TABLE public.passenger_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Passengers can view their own wallet" 
ON public.passenger_wallets FOR SELECT 
TO authenticated 
USING (passenger_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid()));

-- 3. Create cancellation_fees table
CREATE TABLE public.cancellation_fees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    passenger_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    ride_id UUID,
    amount DECIMAL(12,2) NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT ON public.cancellation_fees TO authenticated;
GRANT ALL ON public.cancellation_fees TO service_role;

ALTER TABLE public.cancellation_fees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Passengers can view their own fees" 
ON public.cancellation_fees FOR SELECT 
TO authenticated 
USING (passenger_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid()));

-- Seed Payment Methods
INSERT INTO public.payment_methods (code, name, description, icon, sort_order, requires_balance) VALUES
('pix', 'Pix', 'Pagamento instantâneo', 'CreditCard', 1, false),
('credit', 'Cartão de crédito', 'Pagamento via app', 'CreditCard', 2, false),
('debit', 'Cartão de débito', 'Pagamento via app', 'CreditCard', 3, false),
('cash', 'Dinheiro', 'Pagamento ao motorista', 'Banknote', 4, false),
('wallet', 'Carteira APOIS', 'Saldo no aplicativo', 'Wallet', 0, true);
