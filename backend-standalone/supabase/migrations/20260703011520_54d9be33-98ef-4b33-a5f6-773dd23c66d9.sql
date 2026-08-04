
-- 1. ride_ratings table
CREATE TABLE IF NOT EXISTS public.ride_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL UNIQUE REFERENCES public.rides(id) ON DELETE CASCADE,
  driver_id uuid,
  passenger_id uuid,
  driver_rating smallint CHECK (driver_rating BETWEEN 1 AND 5),
  passenger_rating smallint CHECK (passenger_rating BETWEEN 1 AND 5),
  driver_comment text,
  passenger_comment text,
  driver_rated_at timestamptz,
  passenger_rated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ride_ratings_driver_idx ON public.ride_ratings(driver_id);
CREATE INDEX IF NOT EXISTS ride_ratings_passenger_idx ON public.ride_ratings(passenger_id);

GRANT SELECT ON public.ride_ratings TO authenticated;
GRANT ALL ON public.ride_ratings TO service_role;

ALTER TABLE public.ride_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ratings_read_own" ON public.ride_ratings;
CREATE POLICY "ratings_read_own" ON public.ride_ratings
  FOR SELECT TO authenticated
  USING (auth.uid() = driver_id OR auth.uid() = passenger_id);

CREATE TRIGGER ride_ratings_set_updated_at
  BEFORE UPDATE ON public.ride_ratings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2. Aggregate columns on drivers
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS average_rating numeric(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_ratings integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_rides integer NOT NULL DEFAULT 0;

-- 3. Aggregate columns on users (passenger profile)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS average_rating numeric(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_ratings integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_rides integer NOT NULL DEFAULT 0;

-- 4. Recompute helper functions
CREATE OR REPLACE FUNCTION public.recompute_driver_rating(_driver_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_avg numeric; v_total int;
BEGIN
  SELECT COALESCE(AVG(driver_rating),0)::numeric, COUNT(*)::int
    INTO v_avg, v_total
    FROM public.ride_ratings
   WHERE driver_id = _driver_id AND driver_rating IS NOT NULL;
  UPDATE public.drivers
     SET average_rating = ROUND(v_avg, 2),
         total_ratings = v_total,
         rating = ROUND(v_avg, 2),
         updated_at = now()
   WHERE user_id = _driver_id;
END $$;

CREATE OR REPLACE FUNCTION public.recompute_passenger_rating(_passenger_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_avg numeric; v_total int;
BEGIN
  SELECT COALESCE(AVG(passenger_rating),0)::numeric, COUNT(*)::int
    INTO v_avg, v_total
    FROM public.ride_ratings
   WHERE passenger_id = _passenger_id AND passenger_rating IS NOT NULL;
  UPDATE public.users
     SET average_rating = ROUND(v_avg, 2),
         total_ratings = v_total,
         updated_at = now()
   WHERE auth_user_id = _passenger_id;
END $$;

-- 5. Trigger on rides to mirror ratings into ride_ratings + recompute aggregates
CREATE OR REPLACE FUNCTION public.sync_ride_rating()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  driver_now boolean := NEW.driver_rated_at IS NOT NULL AND (OLD.driver_rated_at IS NULL);
  passenger_now boolean := NEW.passenger_rated_at IS NOT NULL AND (OLD.passenger_rated_at IS NULL);
  finalized_now boolean := NEW.status = 'finalizada' AND (OLD.status IS DISTINCT FROM 'finalizada');
BEGIN
  IF driver_now OR passenger_now THEN
    INSERT INTO public.ride_ratings AS r (
      ride_id, driver_id, passenger_id,
      driver_rating, driver_comment, driver_rated_at,
      passenger_rating, passenger_comment, passenger_rated_at
    ) VALUES (
      NEW.id, NEW.driver_id, NEW.passenger_id,
      CASE WHEN driver_now THEN NEW.driver_rating END,
      CASE WHEN driver_now THEN NEW.driver_rating_comment END,
      CASE WHEN driver_now THEN NEW.driver_rated_at END,
      CASE WHEN passenger_now THEN NEW.passenger_rating END,
      CASE WHEN passenger_now THEN NEW.passenger_rating_comment END,
      CASE WHEN passenger_now THEN NEW.passenger_rated_at END
    )
    ON CONFLICT (ride_id) DO UPDATE SET
      driver_rating       = COALESCE(r.driver_rating,       EXCLUDED.driver_rating),
      driver_comment      = COALESCE(r.driver_comment,      EXCLUDED.driver_comment),
      driver_rated_at     = COALESCE(r.driver_rated_at,     EXCLUDED.driver_rated_at),
      passenger_rating    = COALESCE(r.passenger_rating,    EXCLUDED.passenger_rating),
      passenger_comment   = COALESCE(r.passenger_comment,   EXCLUDED.passenger_comment),
      passenger_rated_at  = COALESCE(r.passenger_rated_at,  EXCLUDED.passenger_rated_at),
      driver_id           = COALESCE(r.driver_id, EXCLUDED.driver_id),
      passenger_id        = COALESCE(r.passenger_id, EXCLUDED.passenger_id),
      updated_at          = now();

    -- driver_rated_at is set by the PASSENGER rating the DRIVER
    IF driver_now AND NEW.driver_id IS NOT NULL THEN
      PERFORM public.recompute_driver_rating(NEW.driver_id);
    END IF;
    -- passenger_rated_at is set by the DRIVER rating the PASSENGER
    IF passenger_now AND NEW.passenger_id IS NOT NULL THEN
      PERFORM public.recompute_passenger_rating(NEW.passenger_id);
    END IF;
  END IF;

  IF finalized_now THEN
    IF NEW.driver_id IS NOT NULL THEN
      UPDATE public.drivers SET completed_rides = completed_rides + 1, updated_at = now()
        WHERE user_id = NEW.driver_id;
    END IF;
    IF NEW.passenger_id IS NOT NULL THEN
      UPDATE public.users SET completed_rides = completed_rides + 1, updated_at = now()
        WHERE auth_user_id = NEW.passenger_id;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_ride_rating ON public.rides;
CREATE TRIGGER trg_sync_ride_rating
  AFTER UPDATE ON public.rides
  FOR EACH ROW EXECUTE FUNCTION public.sync_ride_rating();

-- 6. Backfill ride_ratings from existing ride data
INSERT INTO public.ride_ratings (
  ride_id, driver_id, passenger_id,
  driver_rating, driver_comment, driver_rated_at,
  passenger_rating, passenger_comment, passenger_rated_at
)
SELECT
  id, driver_id, passenger_id,
  driver_rating, driver_rating_comment, driver_rated_at,
  passenger_rating, passenger_rating_comment, passenger_rated_at
FROM public.rides
WHERE driver_rated_at IS NOT NULL OR passenger_rated_at IS NOT NULL
ON CONFLICT (ride_id) DO NOTHING;

-- 7. Backfill aggregates
UPDATE public.drivers d SET
  average_rating = COALESCE(sub.avg, 0),
  total_ratings = COALESCE(sub.cnt, 0),
  rating = COALESCE(sub.avg, d.rating),
  completed_rides = COALESCE(f.cnt, 0)
FROM (
  SELECT driver_id, ROUND(AVG(driver_rating)::numeric, 2) AS avg, COUNT(*) AS cnt
    FROM public.ride_ratings WHERE driver_rating IS NOT NULL GROUP BY driver_id
) sub
FULL JOIN (
  SELECT driver_id, COUNT(*)::int AS cnt FROM public.rides
   WHERE status = 'finalizada' AND driver_id IS NOT NULL GROUP BY driver_id
) f ON f.driver_id = sub.driver_id
WHERE d.user_id = COALESCE(sub.driver_id, f.driver_id);

UPDATE public.users u SET
  average_rating = COALESCE(sub.avg, 0),
  total_ratings = COALESCE(sub.cnt, 0),
  completed_rides = COALESCE(f.cnt, 0)
FROM (
  SELECT passenger_id, ROUND(AVG(passenger_rating)::numeric, 2) AS avg, COUNT(*) AS cnt
    FROM public.ride_ratings WHERE passenger_rating IS NOT NULL GROUP BY passenger_id
) sub
FULL JOIN (
  SELECT passenger_id, COUNT(*)::int AS cnt FROM public.rides
   WHERE status = 'finalizada' AND passenger_id IS NOT NULL GROUP BY passenger_id
) f ON f.passenger_id = sub.passenger_id
WHERE u.auth_user_id = COALESCE(sub.passenger_id, f.passenger_id);

-- 8. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.ride_ratings;
