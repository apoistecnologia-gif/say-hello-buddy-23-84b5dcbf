-- 20260806001000_seed_reference_data.sql
-- IDEMPOTENT REFERENCE DATA FOR APOIS

BEGIN;

-- 1. RIDE CATEGORIES
INSERT INTO public.ride_categories (code, name, description, icon, capacity_label, sort_order)
VALUES 
    ('carros', 'MOVVI Carro', 'Corridas urbanas confortáveis', 'Car', '4 pessoas', 1),
    ('motos', 'MOVVI Moto', 'Chegue mais rápido ao seu destino', 'Bike', '1 pessoa', 2),
    ('fretes', 'MOVVI Fretes', 'Transporte de cargas e mudanças', 'Truck', 'Sob consulta', 3),
    ('guincho', 'MOVVI Guincho', 'Assistência 24h para seu veículo', 'Wrench', '1 veículo', 4),
    ('envios', 'MOVVI Envios', 'Entrega rápida de documentos e pacotes', 'Package', 'Até 10kg', 5)
ON CONFLICT (code) DO UPDATE SET 
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order;

-- 2. TARIFF RULES (Base rates)
INSERT INTO public.tariff_rules (category_id, city, base_fare, min_fare, per_km, per_min, fixed_fee)
SELECT id, 'default', 5.00, 8.00, 2.00, 0.20, 1.00 FROM public.ride_categories WHERE code = 'carros'
ON CONFLICT (category_id, city) DO UPDATE SET
    base_fare = EXCLUDED.base_fare,
    min_fare = EXCLUDED.min_fare;

INSERT INTO public.tariff_rules (category_id, city, base_fare, min_fare, per_km, per_min, fixed_fee)
SELECT id, 'default', 3.00, 5.00, 1.20, 0.10, 0.50 FROM public.ride_categories WHERE code = 'motos'
ON CONFLICT (category_id, city) DO UPDATE SET
    base_fare = EXCLUDED.base_fare,
    min_fare = EXCLUDED.min_fare;

-- 3. PAYMENT METHODS
INSERT INTO public.payment_methods (code, name, description, icon, is_active, sort_order)
VALUES 
    ('pix', 'Pix', 'Pagamento instantâneo', 'Smartphone', TRUE, 1),
    ('credit_card', 'Cartão de Crédito', 'Pague direto no app', 'CreditCard', TRUE, 2),
    ('cash', 'Dinheiro', 'Pague ao motorista', 'Banknote', TRUE, 3),
    ('wallet', 'Carteira MOVVI', 'Use seu saldo disponível', 'Wallet', TRUE, 4)
ON CONFLICT (code) DO UPDATE SET 
    name = EXCLUDED.name,
    is_active = EXCLUDED.is_active,
    sort_order = EXCLUDED.sort_order;

COMMIT;
