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
-- Enforcing schema: category_id, city, base_fare, min_fare, per_km, per_min, stop_fee, fixed_fee, dynamic_multiplier, is_active
INSERT INTO public.tariff_rules (
    category_id, 
    city, 
    base_fare, 
    min_fare, 
    per_km, 
    per_min, 
    stop_fee, 
    fixed_fee, 
    dynamic_multiplier, 
    is_active
)
SELECT 
    rc.id,
    t.city,
    t.base_fare,
    t.min_fare,
    t.per_km,
    t.per_min,
    t.stop_fee,
    t.fixed_fee,
    t.dynamic_multiplier,
    t.is_active
FROM (
    VALUES 
        ('carros', 'default', 5.00, 8.00, 2.00, 0.50, 0.00, 0.00, 1.00, TRUE),
        ('motos', 'default', 3.00, 5.00, 1.20, 0.30, 0.00, 0.00, 1.00, TRUE),
        ('fretes', 'default', 50.00, 80.00, 5.00, 1.00, 0.00, 0.00, 1.00, TRUE),
        ('guincho', 'default', 100.00, 150.00, 10.00, 0.00, 0.00, 0.00, 1.00, TRUE),
        ('envios', 'default', 10.00, 15.00, 2.50, 0.50, 0.00, 0.00, 1.00, TRUE)
) AS t(code, city, base_fare, min_fare, per_km, per_min, stop_fee, fixed_fee, dynamic_multiplier, is_active)
JOIN public.ride_categories rc ON rc.code = t.code
ON CONFLICT (category_id, city) DO UPDATE SET
    base_fare = EXCLUDED.base_fare,
    min_fare = EXCLUDED.min_fare,
    per_km = EXCLUDED.per_km,
    per_min = EXCLUDED.per_min,
    stop_fee = EXCLUDED.stop_fee,
    fixed_fee = EXCLUDED.fixed_fee,
    dynamic_multiplier = EXCLUDED.dynamic_multiplier,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

COMMIT;
