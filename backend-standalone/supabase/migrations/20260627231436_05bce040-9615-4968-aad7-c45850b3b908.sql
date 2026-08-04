ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS driver_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS passenger_photo_url TEXT;