
-- Multi-driver broadcast: track all drivers the ride was offered to.
ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS offered_driver_ids uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_rides_offered_driver_ids
  ON public.rides USING gin (offered_driver_ids);

-- Drivers in offered_driver_ids must be able to SELECT (read row + realtime).
DROP POLICY IF EXISTS rides_select_involved_or_admin ON public.rides;
CREATE POLICY rides_select_involved_or_admin ON public.rides
  FOR SELECT
  USING (
    passenger_id = auth.uid()
    OR driver_id = auth.uid()
    OR current_offer_driver_id = auth.uid()
    OR auth.uid() = ANY(offered_driver_ids)
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
  );
