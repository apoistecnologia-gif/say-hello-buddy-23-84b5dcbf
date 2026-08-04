
ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS passenger_rating smallint,
  ADD COLUMN IF NOT EXISTS passenger_rating_comment text,
  ADD COLUMN IF NOT EXISTS driver_rating smallint,
  ADD COLUMN IF NOT EXISTS driver_rating_comment text;
