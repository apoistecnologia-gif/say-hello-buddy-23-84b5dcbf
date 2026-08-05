-- 1. Garantir restrições UNIQUE para ON CONFLICT
ALTER TABLE public.ride_categories DROP CONSTRAINT IF EXISTS ride_categories_code_key;
ALTER TABLE public.ride_categories ADD CONSTRAINT ride_categories_code_key UNIQUE (code);

ALTER TABLE public.payment_methods DROP CONSTRAINT IF EXISTS payment_methods_code_key;
ALTER TABLE public.payment_methods ADD CONSTRAINT payment_methods_code_key UNIQUE (code);

ALTER TABLE public.tariff_rules DROP CONSTRAINT IF EXISTS tariff_rules_category_id_city_key;
ALTER TABLE public.tariff_rules ADD CONSTRAINT tariff_rules_category_id_city_key UNIQUE (category_id, city);

-- 2. DADOS DE CONFIGURAÇÃO (ride_categories)
INSERT INTO public.ride_categories (code, name, description, icon, image_url, sort_order, is_active)
VALUES
  ('carros', 'Carro', 'Corridas de carro particulares', 'Car', 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&q=80&w=200', 1, true),
  ('motos', 'Moto', 'Corridas de moto rápidas', 'Bike', 'https://images.unsplash.com/photo-1558981403-c5f97db2408d?auto=format&fit=crop&q=80&w=200', 2, true),
  ('fretes', 'Fretes e Mudanças', 'Transporte de cargas e mudanças', 'Truck', 'https://images.unsplash.com/photo-1519003722824-192d9978736b?auto=format&fit=crop&q=80&w=200', 3, true),
  ('guincho', 'Guincho', 'Serviço de reboque 24h', 'Wrench', 'https://images.unsplash.com/photo-1566838217578-290333276182?auto=format&fit=crop&q=80&w=200', 4, true),
  ('envios', 'Envios', 'Entrega de encomendas e documentos', 'Package', 'https://images.unsplash.com/photo-1586769852836-bc069f19e1b6?auto=format&fit=crop&q=80&w=200', 5, true)
ON CONFLICT (code) DO UPDATE SET 
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active;

-- 3. DADOS DE CONFIGURAÇÃO (payment_methods)
INSERT INTO public.payment_methods (code, name, description, icon, is_active, sort_order)
VALUES
  ('pix', 'Pix', 'Pagamento instantâneo', 'QrCode', true, 1),
  ('credit', 'Crédito', 'Cartão de crédito via app', 'CreditCard', true, 2),
  ('debit', 'Débito', 'Cartão de débito na máquina', 'CreditCard', true, 3),
  ('cash', 'Dinheiro', 'Pagamento em espécie ao motorista', 'Banknote', true, 4),
  ('wallet', 'Carteira APOIS', 'Saldo da sua carteira digital', 'Wallet', true, 5)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = EXCLUDED.is_active;

-- 4. DADOS DE CONFIGURAÇÃO (tariff_rules)
INSERT INTO public.tariff_rules (category_id, city, base_fare, per_km, per_min, min_fare, stop_fee, fixed_fee, is_active)
SELECT id, 'Geral', 6.00, 2.40, 0.35, 8.00, 3.00, 0.00, true FROM public.ride_categories WHERE code = 'carros'
UNION ALL
SELECT id, 'Geral', 3.50, 1.40, 0.20, 5.00, 2.00, 0.00, true FROM public.ride_categories WHERE code = 'motos'
UNION ALL
SELECT id, 'Geral', 15.00, 3.50, 0.50, 20.00, 5.00, 10.00, true FROM public.ride_categories WHERE code = 'fretes'
UNION ALL
SELECT id, 'Geral', 80.00, 5.50, 0.00, 100.00, 0.00, 50.00, true FROM public.ride_categories WHERE code = 'guincho'
UNION ALL
SELECT id, 'Geral', 6.00, 1.80, 0.00, 10.00, 0.00, 3.00, true FROM public.ride_categories WHERE code = 'envios'
ON CONFLICT (category_id, city) DO UPDATE SET
  base_fare = EXCLUDED.base_fare,
  per_km = EXCLUDED.per_km,
  per_min = EXCLUDED.per_min,
  min_fare = EXCLUDED.min_fare;

-- 5. TRIGGER handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role public.app_role;
BEGIN
  v_role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'passenger');

  INSERT INTO public.users (auth_user_id, name, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email,
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (auth_user_id) DO UPDATE SET
    name = EXCLUDED.name,
    phone = EXCLUDED.phone;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  IF v_role = 'passenger' THEN
    INSERT INTO public.passenger_wallets (passenger_id, balance, currency)
    VALUES (NEW.id, 0.00, 'BRL')
    ON CONFLICT (passenger_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
