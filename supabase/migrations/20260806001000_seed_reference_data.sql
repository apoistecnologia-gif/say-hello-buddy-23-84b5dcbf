-- 20260806001000_seed_reference_data.sql
-- IDEMPOTENT REFERENCE DATA FOR APOIS BRAND
-- TARGET BACKEND: vqtucstyduxrqjgyigfk

BEGIN;

-- 1. RIDE CATEGORIES (APOIS BRANDING)
INSERT INTO public.ride_categories (code, name, description, icon, sort_order, is_active)
VALUES 
    ('carros', 'APOIS Carro', 'Viagens rápidas e confortáveis', 'Car', 1, TRUE),
    ('motos', 'APOIS Moto', 'Economia e agilidade no trânsito', 'Bike', 2, TRUE),
    ('fretes', 'APOIS Fretes', 'Transporte de cargas e mudanças', 'Truck', 3, TRUE),
    ('guincho', 'APOIS Guincho', 'Assistência 24h para seu veículo', 'Towing', 4, TRUE),
    ('envios', 'APOIS Envios', 'Entrega rápida de documentos e objetos', 'Package', 5, TRUE)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- 2. PAYMENT METHODS
INSERT INTO public.payment_methods (code, name, description, icon, sort_order, is_active)
VALUES 
    ('money', 'Dinheiro', 'Pagamento em espécie ao motorista', 'Banknote', 1, TRUE),
    ('pix', 'PIX', 'Pagamento instantâneo', 'QrCode', 2, TRUE),
    ('wallet', 'Carteira APOIS', 'Saldo pré-pago no aplicativo', 'Wallet', 3, TRUE),
    ('credit_card', 'Cartão de Crédito', 'Pagamento online via Mercado Pago', 'CreditCard', 4, TRUE)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- 3. TARIFF RULES (IDEMPOTENT UPSERT)
-- Note: Using category_key and field_key for legacy Edge Function compatibility
INSERT INTO public.tariff_rules (category_key, field_key, city, value, base_fare, min_fare, per_km, per_min)
VALUES 
    ('carros', 'base', 'default', 5.00, 5.00, 8.00, 2.00, 0.50),
    ('motos', 'base', 'default', 3.00, 3.00, 5.00, 1.20, 0.30),
    ('fretes', 'base', 'default', 50.00, 50.00, 80.00, 5.00, 1.00),
    ('guincho', 'base', 'default', 100.00, 100.00, 150.00, 10.00, 0.00),
    ('envios', 'base', 'default', 10.00, 10.00, 15.00, 2.50, 0.50)
ON CONFLICT (category_key, field_key, city) DO UPDATE SET
    value = EXCLUDED.value,
    base_fare = EXCLUDED.base_fare,
    min_fare = EXCLUDED.min_fare,
    per_km = EXCLUDED.per_km,
    per_min = EXCLUDED.per_min,
    updated_at = NOW();

COMMIT;
