-- MOVVI critical dispatch fix: separate ride offer from active ride.
-- Root cause fixed here:
-- 1) offered_driver_ids was being used both as candidate list and mutable UI visibility list.
-- 2) current_offer_driver_id kept a single-driver pointer, making broadcast look like rotation.
-- 3) there was no stable accepted_driver_id/request lifetime field for atomic acceptance.

ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS candidate_driver_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS accepted_driver_id uuid,
  ADD COLUMN IF NOT EXISTS request_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_rides_candidate_driver_ids
  ON public.rides USING gin (candidate_driver_ids);

CREATE INDEX IF NOT EXISTS idx_rides_accepted_driver_id
  ON public.rides (accepted_driver_id);

CREATE INDEX IF NOT EXISTS idx_rides_request_expires_at
  ON public.rides (request_expires_at);

-- Backfill accepted rides and keep the new candidate list compatible with older rows.
UPDATE public.rides
SET accepted_driver_id = driver_id
WHERE accepted_driver_id IS NULL
  AND driver_id IS NOT NULL;

UPDATE public.rides
SET candidate_driver_ids = offered_driver_ids
WHERE status = 'procurar_motorista'::public.ride_status
  AND accepted_driver_id IS NULL
  AND COALESCE(array_length(candidate_driver_ids, 1), 0) = 0
  AND COALESCE(array_length(offered_driver_ids, 1), 0) > 0;

-- Drivers in candidate_driver_ids must be able to read the offer row for REST + Realtime.
DROP POLICY IF EXISTS rides_select_involved_or_admin ON public.rides;
CREATE POLICY rides_select_involved_or_admin
  ON public.rides
  AS PERMISSIVE
  FOR SELECT
  USING (
    passenger_id = auth.uid()
    OR driver_id = auth.uid()
    OR accepted_driver_id = auth.uid()
    OR (
      auth.uid() = ANY(candidate_driver_ids)
      AND NOT (auth.uid() = ANY(rejected_driver_ids))
    )
    OR private.has_role(auth.uid(), 'admin'::app_role)
  );
