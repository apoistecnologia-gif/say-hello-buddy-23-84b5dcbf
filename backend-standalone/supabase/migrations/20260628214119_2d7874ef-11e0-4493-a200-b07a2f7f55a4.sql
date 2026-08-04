-- Extend driver_subscription_status enum with pending + suspended
ALTER TYPE public.driver_subscription_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE public.driver_subscription_status ADD VALUE IF NOT EXISTS 'suspended';

-- Add subscription control columns on drivers (manual admin control / test mode)
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_grace_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subscription_admin_note text,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid';
