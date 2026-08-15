create or replace function private.calculate_electronic_processing_fee_cents(_fare_cents bigint)
returns bigint
language plpgsql
immutable
strict
set search_path to ''
as $function$
declare
  v_fee bigint;
begin
  if _fare_cents <= 0 then
    raise exception 'invalid_fare_cents' using errcode='22023';
  end if;

  -- The passenger processing fee grosses up an 0.80% provider cost so the
  -- ride fare itself remains whole for the driver: fee = fare / 124.
  v_fee := ceil(_fare_cents::numeric / 124)::bigint;
  return greatest(50::bigint, least(500::bigint, v_fee));
end;
$function$;

revoke all on function private.calculate_electronic_processing_fee_cents(bigint) from public, anon, authenticated;
grant execute on function private.calculate_electronic_processing_fee_cents(bigint) to service_role;

alter table public.rides
  add column if not exists fare_amount_cents bigint,
  add column if not exists processing_fee_cents bigint,
  add column if not exists passenger_charge_cents bigint;

alter table public.rides
  drop constraint if exists rides_financial_snapshot_nonnegative,
  drop constraint if exists rides_financial_snapshot_arithmetic;

alter table public.rides
  add constraint rides_financial_snapshot_nonnegative check (
    (fare_amount_cents is null or fare_amount_cents > 0)
    and (processing_fee_cents is null or processing_fee_cents >= 0)
    and (passenger_charge_cents is null or passenger_charge_cents > 0)
  ),
  add constraint rides_financial_snapshot_arithmetic check (
    (fare_amount_cents is null and processing_fee_cents is null and passenger_charge_cents is null)
    or (
      fare_amount_cents is not null
      and processing_fee_cents is not null
      and passenger_charge_cents is not null
      and passenger_charge_cents = fare_amount_cents + processing_fee_cents
    )
  );

create or replace function private.stamp_ride_financial_snapshot()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_fare_cents bigint;
  v_fee_cents bigint;
begin
  if new.estimated_price is null or new.estimated_price <= 0 then
    raise exception 'invalid_estimated_price' using errcode='22023';
  end if;

  v_fare_cents := round(new.estimated_price * 100)::bigint;
  if v_fare_cents <= 0 then
    raise exception 'invalid_fare_cents' using errcode='22023';
  end if;

  v_fee_cents := case
    when lower(coalesce(new.payment_method,'')) = 'pix'
      then private.calculate_electronic_processing_fee_cents(v_fare_cents)
    else 0
  end;

  new.fare_amount_cents := v_fare_cents;
  new.processing_fee_cents := v_fee_cents;
  new.passenger_charge_cents := v_fare_cents + v_fee_cents;
  return new;
end;
$function$;

revoke all on function private.stamp_ride_financial_snapshot() from public, anon, authenticated;
grant execute on function private.stamp_ride_financial_snapshot() to service_role;

drop trigger if exists trg_stamp_ride_financial_snapshot on public.rides;
create trigger trg_stamp_ride_financial_snapshot
before insert or update of estimated_price, payment_method
on public.rides
for each row execute function private.stamp_ride_financial_snapshot();

create or replace function private.enforce_ride_financial_snapshot_immutability()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if old.fare_amount_cents is not null
     and (
       new.fare_amount_cents is distinct from old.fare_amount_cents
       or new.processing_fee_cents is distinct from old.processing_fee_cents
       or new.passenger_charge_cents is distinct from old.passenger_charge_cents
     )
     and new.estimated_price is not distinct from old.estimated_price
     and new.payment_method is not distinct from old.payment_method then
    raise exception 'ride_financial_snapshot_immutable' using errcode='55000';
  end if;
  return new;
end;
$function$;

revoke all on function private.enforce_ride_financial_snapshot_immutability() from public, anon, authenticated;
grant execute on function private.enforce_ride_financial_snapshot_immutability() to service_role;

drop trigger if exists trg_enforce_ride_financial_snapshot_immutability on public.rides;
create trigger trg_enforce_ride_financial_snapshot_immutability
before update of fare_amount_cents, processing_fee_cents, passenger_charge_cents
on public.rides
for each row execute function private.enforce_ride_financial_snapshot_immutability();

alter table public.ride_settlements
  add column if not exists processing_fee numeric(12,2) not null default 0;

alter table public.ride_settlements
  drop constraint if exists ride_settlements_processing_fee_nonnegative;
alter table public.ride_settlements
  add constraint ride_settlements_processing_fee_nonnegative check (processing_fee >= 0);

insert into public.app_settings(key,value,description,updated_at)
values(
  'finance.passenger_processing_fee_rule',
  '{"enabled":true,"applies_to":["pix"],"provider_rate_bps":80,"gross_up":true,"min_cents":50,"max_cents":500}'::jsonb,
  'Taxa de processamento separada do valor da corrida; 100% da tarifa da corrida pertence ao motorista e a comissão da APOIS sobre a corrida é R$ 0,00.',
  now()
)
on conflict(key) do update set
  value=excluded.value,
  description=excluded.description,
  updated_at=now();
