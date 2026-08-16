BEGIN;

-- Compatibility RPC for the passenger app.
-- The production cancellation backend uses these canonical settings:
--   ride.cancellation_free_minutes
--   ride.cancellation_fee_amount
-- Keep app_settings backend-only and expose only the policy fields needed by
-- authenticated passengers. Defaults intentionally mirror cancel-ride.
CREATE OR REPLACE FUNCTION public.get_ride_cancellation_policy()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_free_minutes numeric;
  v_fee_amount numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT CASE
    WHEN (value #>> '{}') ~ '^[0-9]+([.][0-9]+)?$'
      THEN (value #>> '{}')::numeric
    ELSE NULL
  END
  INTO v_free_minutes
  FROM public.app_settings
  WHERE key = 'ride.cancellation_free_minutes';

  SELECT CASE
    WHEN (value #>> '{}') ~ '^[0-9]+([.][0-9]+)?$'
      THEN (value #>> '{}')::numeric
    ELSE NULL
  END
  INTO v_fee_amount
  FROM public.app_settings
  WHERE key = 'ride.cancellation_fee_amount';

  -- These fallbacks are the same values enforced by cancel-ride if a setting
  -- is absent or invalid, preventing the passenger UI from showing a policy
  -- different from the backend behavior.
  v_free_minutes := COALESCE(v_free_minutes, 2);
  v_fee_amount := COALESCE(v_fee_amount, 5);

  RETURN jsonb_build_object(
    'enabled', v_fee_amount > 0,
    'free_seconds', floor(v_free_minutes * 60)::integer,
    'amount', round(v_fee_amount, 2),
    'block_after_driver_arrival', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_ride_cancellation_policy() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_ride_cancellation_policy() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_ride_cancellation_policy() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ride_cancellation_policy() TO service_role;

COMMIT;
