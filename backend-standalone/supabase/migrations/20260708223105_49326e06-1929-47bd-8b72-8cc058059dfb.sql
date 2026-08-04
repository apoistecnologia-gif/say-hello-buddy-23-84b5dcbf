
ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;

CREATE INDEX IF NOT EXISTS idx_rides_scheduled_pending
  ON public.rides (scheduled_for)
  WHERE status = 'agendada';

CREATE OR REPLACE FUNCTION public.validate_scheduled_ride()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'agendada' THEN
    IF NEW.scheduled_for IS NULL THEN
      RAISE EXCEPTION 'scheduled_for_required'
        USING HINT = 'Corridas agendadas precisam de scheduled_for.';
    END IF;
    IF TG_OP = 'INSERT' AND NEW.scheduled_for < now() + interval '15 minutes' THEN
      RAISE EXCEPTION 'scheduled_too_soon'
        USING HINT = 'Agende para pelo menos 15 minutos à frente.';
    END IF;
    IF NEW.scheduled_for > now() + interval '30 days' THEN
      RAISE EXCEPTION 'scheduled_too_far'
        USING HINT = 'O máximo permitido é 30 dias à frente.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_scheduled_ride ON public.rides;
CREATE TRIGGER trg_validate_scheduled_ride
  BEFORE INSERT OR UPDATE OF status, scheduled_for ON public.rides
  FOR EACH ROW EXECUTE FUNCTION public.validate_scheduled_ride();

CREATE OR REPLACE FUNCTION public.activate_due_scheduled_rides()
RETURNS TABLE(activated_ride_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.rides
     SET status = 'procurar_motorista',
         updated_at = now()
   WHERE status = 'agendada'
     AND scheduled_for IS NOT NULL
     AND scheduled_for <= now() + interval '15 minutes'
  RETURNING id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.activate_due_scheduled_rides() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_due_scheduled_rides() TO service_role;
