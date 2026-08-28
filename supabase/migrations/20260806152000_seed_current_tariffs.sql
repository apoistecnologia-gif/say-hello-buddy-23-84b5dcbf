-- Tarifas preservadas do MOVVI PRODUÇÃO e normalizadas para APOIS.
insert into public.tariff_rules (
  category_id, city, base_fare, min_fare, per_km, per_min, stop_fee, fixed_fee,
  dynamic_multiplier, is_active
)
select id, 'default',
  case code
    when 'carros' then 6.00
    when 'motos' then 3.50
    when 'fretes' then 12.00
    when 'guincho' then 80.00
    when 'envios' then 8.00
  end,
  case code
    when 'carros' then 8.00
    when 'motos' then 5.00
    when 'fretes' then 18.00
    when 'guincho' then 80.00
    when 'envios' then 8.00
  end,
  case code
    when 'carros' then 2.40
    when 'motos' then 1.40
    when 'fretes' then 3.20
    when 'guincho' then 5.50
    when 'envios' then 2.00
  end,
  case code
    when 'carros' then 0.35
    when 'motos' then 0.20
    when 'fretes' then 0.50
    else 0.00
  end,
  case code
    when 'carros' then 3.00
    when 'fretes' then 5.00
    else 0.00
  end,
  0.00,
  1.00,
  true
from public.ride_categories
where code in ('carros','motos','fretes','guincho','envios')
on conflict (category_id, city) do update set
  base_fare = excluded.base_fare,
  min_fare = excluded.min_fare,
  per_km = excluded.per_km,
  per_min = excluded.per_min,
  stop_fee = excluded.stop_fee,
  fixed_fee = excluded.fixed_fee,
  dynamic_multiplier = excluded.dynamic_multiplier,
  is_active = true,
  updated_at = now();
