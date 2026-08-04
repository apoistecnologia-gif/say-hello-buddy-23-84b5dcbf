ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS cancellation_fee_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS driver_distance_to_pickup_at_cancel numeric;