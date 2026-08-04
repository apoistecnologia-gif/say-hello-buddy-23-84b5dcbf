ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS driver_rated_at timestamptz,
  ADD COLUMN IF NOT EXISTS passenger_rated_at timestamptz;