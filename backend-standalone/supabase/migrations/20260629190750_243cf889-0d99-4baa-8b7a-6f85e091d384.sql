
ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS pickup_label TEXT,
  ADD COLUMN IF NOT EXISTS pickup_short_label TEXT,
  ADD COLUMN IF NOT EXISTS pickup_address TEXT,
  ADD COLUMN IF NOT EXISTS pickup_place_id TEXT,
  ADD COLUMN IF NOT EXISTS pickup_source TEXT;
