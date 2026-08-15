-- Compatibility bridge for environments created before the passenger-paid
-- processing-fee settlement column existed.
alter table public.ride_settlements
  add column if not exists processing_fee numeric(12,2) not null default 0;

alter table public.ride_settlements
  drop constraint if exists ride_settlements_processing_fee_nonnegative;
alter table public.ride_settlements
  add constraint ride_settlements_processing_fee_nonnegative
  check (processing_fee >= 0);
