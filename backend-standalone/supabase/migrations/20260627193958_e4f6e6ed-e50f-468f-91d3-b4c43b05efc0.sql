-- Trigger to enforce single rating per side per ride
CREATE OR REPLACE FUNCTION public.enforce_single_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Driver rating (set by passenger): driver_rating + driver_rated_at
  IF NEW.driver_rated_at IS NOT NULL
     AND OLD.driver_rated_at IS NOT NULL
     AND NEW.driver_rated_at IS DISTINCT FROM OLD.driver_rated_at THEN
    RAISE EXCEPTION 'driver_rating_already_submitted'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Passenger rating (set by driver): passenger_rating + passenger_rated_at
  IF NEW.passenger_rated_at IS NOT NULL
     AND OLD.passenger_rated_at IS NOT NULL
     AND NEW.passenger_rated_at IS DISTINCT FROM OLD.passenger_rated_at THEN
    RAISE EXCEPTION 'passenger_rating_already_submitted'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Only allow rating when ride is finalizada
  IF (NEW.driver_rated_at IS NOT NULL AND OLD.driver_rated_at IS NULL)
     OR (NEW.passenger_rated_at IS NOT NULL AND OLD.passenger_rated_at IS NULL) THEN
    IF NEW.status <> 'finalizada' THEN
      RAISE EXCEPTION 'ride_not_finalized_cannot_rate'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Validate rating range 1..5
  IF NEW.driver_rating IS NOT NULL AND (NEW.driver_rating < 1 OR NEW.driver_rating > 5) THEN
    RAISE EXCEPTION 'driver_rating_out_of_range' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.passenger_rating IS NOT NULL AND (NEW.passenger_rating < 1 OR NEW.passenger_rating > 5) THEN
    RAISE EXCEPTION 'passenger_rating_out_of_range' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_rating ON public.rides;
CREATE TRIGGER trg_enforce_single_rating
BEFORE UPDATE ON public.rides
FOR EACH ROW
EXECUTE FUNCTION public.enforce_single_rating();