-- Create ride_categories table
CREATE TABLE IF NOT EXISTS public.ride_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    description text,
    icon text,
    image_url text,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    capacity_label text,
    eta_label text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Create tariff_rules table
CREATE TABLE IF NOT EXISTS public.tariff_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id uuid REFERENCES public.ride_categories(id) ON DELETE CASCADE,
    city text,
    base_fare numeric(10, 2) NOT NULL DEFAULT 0,
    per_km numeric(10, 2) NOT NULL DEFAULT 0,
    per_min numeric(10, 2) NOT NULL DEFAULT 0,
    min_fare numeric(10, 2) NOT NULL DEFAULT 0,
    stop_fee numeric(10, 2) NOT NULL DEFAULT 0,
    fixed_fee numeric(10, 2) NOT NULL DEFAULT 0,
    dynamic_multiplier numeric(10, 2) DEFAULT 1.0,
    is_active boolean DEFAULT true,
    valid_from timestamptz DEFAULT now(),
    valid_to timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Grant access
GRANT SELECT ON public.ride_categories TO authenticated;
GRANT SELECT ON public.tariff_rules TO authenticated;
GRANT ALL ON public.ride_categories TO service_role;
GRANT ALL ON public.tariff_rules TO service_role;

-- Enable RLS
ALTER TABLE public.ride_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tariff_rules ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view active ride categories" 
ON public.ride_categories FOR SELECT 
TO authenticated 
USING (is_active = true);

CREATE POLICY "Authenticated users can view active tariff rules" 
ON public.tariff_rules FOR SELECT 
TO authenticated 
USING (is_active = true AND (valid_to IS NULL OR valid_to > now()));

-- Insert initial categories
INSERT INTO public.ride_categories (code, name, description, sort_order) VALUES
('carro', 'Carro', 'Conforto para o dia a dia', 1),
('moto', 'Moto', 'Mais rápido no trânsito', 2),
('fretes', 'Fretes e Mudanças', 'Transporte de cargas e mudanças', 3),
('guincho', 'Guincho', 'Resgate de veículos', 4),
('envios', 'Envios', 'Pequenos volumes e encomendas', 5)
ON CONFLICT (code) DO UPDATE SET 
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order;

-- Insert initial tariff rules (example values)
INSERT INTO public.tariff_rules (category_id, base_fare, per_km, per_min, min_fare, stop_fee)
SELECT id, 5.00, 2.00, 0.50, 8.00, 1.50 FROM public.ride_categories WHERE code = 'carro'
UNION ALL
SELECT id, 3.00, 1.20, 0.30, 5.00, 1.00 FROM public.ride_categories WHERE code = 'moto'
UNION ALL
SELECT id, 50.00, 5.00, 1.00, 80.00, 10.00 FROM public.ride_categories WHERE code = 'fretes'
UNION ALL
SELECT id, 100.00, 10.00, 2.00, 150.00, 0.00 FROM public.ride_categories WHERE code = 'guincho'
UNION ALL
SELECT id, 5.00, 1.50, 0.40, 7.00, 0.00 FROM public.ride_categories WHERE code = 'envios';
