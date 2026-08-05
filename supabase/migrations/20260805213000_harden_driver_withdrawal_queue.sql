-- Harden the driver payout queue at the database layer.
-- Additive and idempotent: prevents concurrent active withdrawals and preserves
-- provider reconciliation metadata without changing existing payout flows.

BEGIN;

ALTER TABLE public.driver_withdrawals
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS provider_response jsonb,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Keep only the newest active request if legacy duplicates exist. Older rows are
-- returned to failed so their already reserved balance can be reconciled by the
-- existing failure/refund routine before production rollout.
WITH ranked_active AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY driver_id
      ORDER BY created_at DESC, id DESC
    ) AS position
  FROM public.driver_withdrawals
  WHERE status::text IN ('pending', 'processing')
)
UPDATE public.driver_withdrawals
   SET status = 'failed',
       rejection_reason = COALESCE(
         rejection_reason,
         'Solicitação duplicada encerrada durante endurecimento da fila.'
       ),
       updated_at = now()
 WHERE id IN (
   SELECT id FROM ranked_active WHERE position > 1
 );

CREATE UNIQUE INDEX IF NOT EXISTS ux_driver_withdrawals_one_active_per_driver
  ON public.driver_withdrawals(driver_id)
  WHERE status::text IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS ix_driver_withdrawals_processing_reconciliation
  ON public.driver_withdrawals(status, processing_started_at)
  WHERE status::text = 'processing';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'driver_withdrawals_amount_safe_range'
       AND conrelid = 'public.driver_withdrawals'::regclass
  ) THEN
    ALTER TABLE public.driver_withdrawals
      ADD CONSTRAINT driver_withdrawals_amount_safe_range
      CHECK (amount >= 20 AND amount <= 50000) NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.touch_driver_withdrawal_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status::text = 'processing' AND OLD.status::text IS DISTINCT FROM 'processing' THEN
    NEW.processing_started_at := COALESCE(NEW.processing_started_at, now());
    NEW.attempt_count := COALESCE(OLD.attempt_count, 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_driver_withdrawal_updated_at
  ON public.driver_withdrawals;
CREATE TRIGGER trg_touch_driver_withdrawal_updated_at
BEFORE UPDATE ON public.driver_withdrawals
FOR EACH ROW
EXECUTE FUNCTION public.touch_driver_withdrawal_updated_at();

REVOKE ALL ON FUNCTION public.touch_driver_withdrawal_updated_at()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_driver_withdrawal_updated_at()
  TO service_role;

COMMIT;
