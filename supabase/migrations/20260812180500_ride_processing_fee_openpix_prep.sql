-- APOIS Corridas: passenger-paid processing fee preparation.
-- Safe/additive only. Provider remains unchanged until OpenPix credentials/webhook are homologated.

alter table public.rides
  add column if not exists processing_fee numeric(12,2) not null default 0,
  add column if not exists passenger_total numeric(12,2);

update public.rides
set passenger_total = coalesce(estimated_price, final_price, 0) + coalesce(processing_fee, 0)
where passenger_total is null;

alter table public.rides
  alter column passenger_total set default 0,
  alter column passenger_total set not null;

alter table public.ride_pix_payments
  add column if not exists fare_amount_cents bigint,
  add column if not exists processing_fee_cents bigint not null default 0,
  add column if not exists passenger_total_cents bigint;

update public.ride_pix_payments p
set
  fare_amount_cents = coalesce(p.fare_amount_cents, round(coalesce(r.estimated_price, r.final_price, 0) * 100)::bigint),
  passenger_total_cents = coalesce(
    p.passenger_total_cents,
    round((coalesce(r.estimated_price, r.final_price, 0) + coalesce(r.processing_fee, 0)) * 100)::bigint
  )
from public.rides r
where r.id = p.ride_id
  and (p.fare_amount_cents is null or p.passenger_total_cents is null);

-- Keep historic/unmatched rows valid without guessing an external provider amount.
update public.ride_pix_payments
set fare_amount_cents = coalesce(fare_amount_cents, 0),
    passenger_total_cents = coalesce(passenger_total_cents, fare_amount_cents, 0)
where fare_amount_cents is null or passenger_total_cents is null;

alter table public.ride_pix_payments
  alter column fare_amount_cents set default 0,
  alter column fare_amount_cents set not null,
  alter column passenger_total_cents set default 0,
  alter column passenger_total_cents set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rides_processing_fee_nonnegative'
  ) then
    alter table public.rides
      add constraint rides_processing_fee_nonnegative check (processing_fee >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'rides_passenger_total_nonnegative'
  ) then
    alter table public.rides
      add constraint rides_passenger_total_nonnegative check (passenger_total >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'ride_pix_payments_amounts_nonnegative'
  ) then
    alter table public.ride_pix_payments
      add constraint ride_pix_payments_amounts_nonnegative check (
        fare_amount_cents >= 0 and processing_fee_cents >= 0 and passenger_total_cents >= 0
      );
  end if;
end
$$;

insert into public.app_settings (key, value, updated_at)
values
  ('finance.ride_processing_fee_enabled', 'false'::jsonb, now()),
  ('finance.ride_processing_fee_rate_bps', '80'::jsonb, now()),
  ('finance.ride_processing_fee_min_cents', '50'::jsonb, now()),
  ('finance.ride_processing_fee_max_cents', '500'::jsonb, now()),
  ('finance.ride_processing_fee_label', '"Taxa de processamento"'::jsonb, now())
on conflict (key) do nothing;

comment on column public.rides.processing_fee is
  'Passenger-paid payment processing fee. Not driver fare and not platform commission.';
comment on column public.rides.passenger_total is
  'Total charged to passenger: ride fare plus applicable processing fee.';
comment on column public.ride_pix_payments.fare_amount_cents is
  'Ride fare/driver earning basis in integer cents.';
comment on column public.ride_pix_payments.processing_fee_cents is
  'Passenger-paid payment processing fee in integer cents.';
comment on column public.ride_pix_payments.passenger_total_cents is
  'Total payment provider charge in integer cents.';
