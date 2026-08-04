
-- Single source of truth: drivers.subscription_status
-- A trigger mirrors the LATEST subscription row for each driver into
-- drivers.subscription_status + drivers.subscription_expires_at.

CREATE OR REPLACE FUNCTION public.sync_driver_subscription_from_subscriptions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_latest_id uuid;
BEGIN
  -- Only mirror if the changed row is (still) the most recent one for the driver.
  SELECT id INTO v_latest_id
    FROM public.subscriptions
   WHERE driver_id = NEW.driver_id
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_latest_id IS NULL OR v_latest_id <> NEW.id THEN
    RETURN NEW;
  END IF;

  UPDATE public.drivers d
     SET subscription_status = NEW.status,
         subscription_expires_at = COALESCE(NEW.period_end, d.subscription_expires_at),
         updated_at = now()
   WHERE d.id = NEW.driver_id
     AND (
       d.subscription_status IS DISTINCT FROM NEW.status
       OR d.subscription_expires_at IS DISTINCT FROM COALESCE(NEW.period_end, d.subscription_expires_at)
     );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_driver_subscription ON public.subscriptions;
CREATE TRIGGER trg_sync_driver_subscription
AFTER INSERT OR UPDATE OF status, period_end ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.sync_driver_subscription_from_subscriptions();

-- Backfill: for every driver that has at least one subscription, ensure the
-- drivers row reflects the latest subscription.
UPDATE public.drivers d
   SET subscription_status = s.status,
       subscription_expires_at = COALESCE(s.period_end, d.subscription_expires_at),
       updated_at = now()
  FROM (
    SELECT DISTINCT ON (driver_id) driver_id, status, period_end
      FROM public.subscriptions
     ORDER BY driver_id, created_at DESC
  ) s
 WHERE s.driver_id = d.id
   AND (
     d.subscription_status IS DISTINCT FROM s.status
     OR d.subscription_expires_at IS DISTINCT FROM COALESCE(s.period_end, d.subscription_expires_at)
   );
