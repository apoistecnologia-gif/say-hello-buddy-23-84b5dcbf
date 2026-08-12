-- Server-side source of truth for passenger processing fee.
-- The client may display the quote, but cannot choose/override these monetary fields.

create or replace function public.apply_ride_processing_fee()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_enabled boolean := false;
  v_rate_bps integer := 80;
  v_min_cents bigint := 50;
  v_max_cents bigint := 500;
  v_fare_cents bigint;
  v_fee_cents bigint := 0;
  v_percent_fee numeric;
begin
  select coalesce((value #>> '{}')::boolean, false)
    into v_enabled
  from public.app_settings
  where key = 'finance.ride_processing_fee_enabled';

  select coalesce((value #>> '{}')::integer, 80)
    into v_rate_bps
  from public.app_settings
  where key = 'finance.ride_processing_fee_rate_bps';

  select coalesce((value #>> '{}')::bigint, 50)
    into v_min_cents
  from public.app_settings
  where key = 'finance.ride_processing_fee_min_cents';

  select coalesce((value #>> '{}')::bigint, 500)
    into v_max_cents
  from public.app_settings
  where key = 'finance.ride_processing_fee_max_cents';

  v_rate_bps := greatest(0, least(coalesce(v_rate_bps,80), 9999));
  v_min_cents := greatest(0, coalesce(v_min_cents,50));
  v_max_cents := greatest(v_min_cents, coalesce(v_max_cents,500));
  v_fare_cents := greatest(0, round(coalesce(new.estimated_price,0) * 100)::bigint);

  if lower(trim(coalesce(new.payment_method,''))) = 'pix'
     and coalesce(v_enabled,false)
     and v_fare_cents > 0 then
    if v_rate_bps > 0 then
      -- Minimal gross-up satisfying fee >= rate * (fare + fee), rounded upward.
      v_percent_fee := ceil((v_fare_cents::numeric * v_rate_bps::numeric) / (10000 - v_rate_bps)::numeric);
      v_fee_cents := least(v_max_cents, greatest(v_min_cents, v_percent_fee::bigint));
    else
      v_fee_cents := least(v_max_cents, v_min_cents);
    end if;
  end if;

  new.processing_fee := round(v_fee_cents::numeric / 100, 2);
  new.passenger_total := round((v_fare_cents + v_fee_cents)::numeric / 100, 2);
  return new;
end;
$$;

drop trigger if exists trg_apply_ride_processing_fee on public.rides;
create trigger trg_apply_ride_processing_fee
before insert or update of estimated_price, payment_method
on public.rides
for each row
execute function public.apply_ride_processing_fee();

comment on function public.apply_ride_processing_fee() is
  'Calculates the official passenger processing fee and passenger total from server settings; clients cannot set these values.';
