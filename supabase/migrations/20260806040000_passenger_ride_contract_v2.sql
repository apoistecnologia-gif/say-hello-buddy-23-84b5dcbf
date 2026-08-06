-- APOIS Passageiro — contrato operacional de corridas v2
-- Aditivo, idempotente e compatível com bancos que já possuem parte das colunas.

BEGIN;

CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS origin jsonb,
  ADD COLUMN IF NOT EXISTS destination jsonb,
  ADD COLUMN IF NOT EXISTS intermediates jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS request_key uuid,
  ADD COLUMN IF NOT EXISTS candidate_driver_ids uuid[] DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS offered_driver_ids uuid[] DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS current_offer_driver_id uuid,
  ADD COLUMN IF NOT EXISTS accepted_driver_id uuid,
  ADD COLUMN IF NOT EXISTS rejected_driver_ids uuid[] DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS request_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS search_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS pickup_label text,
  ADD COLUMN IF NOT EXISTS pickup_short_label text,
  ADD COLUMN IF NOT EXISTS pickup_address text,
  ADD COLUMN IF NOT EXISTS pickup_place_id text,
  ADD COLUMN IF NOT EXISTS pickup_source text,
  ADD COLUMN IF NOT EXISTS service_details jsonb,
  ADD COLUMN IF NOT EXISTS encoded_polyline text,
  ADD COLUMN IF NOT EXISTS cancellation_fee numeric(10,2),
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS queued_after_ride_id uuid;

UPDATE public.rides
SET origin = jsonb_build_object(
  'lat', origin_lat,
  'lng', origin_lng,
  'label', origin_name,
  'address', origin_name,
  'source', COALESCE(pickup_source, 'legacy')
)
WHERE origin IS NULL;

UPDATE public.rides
SET destination = jsonb_build_object(
  'lat', destination_lat,
  'lng', destination_lng,
  'label', destination_name,
  'address', destination_name,
  'source', 'legacy'
)
WHERE destination IS NULL;

UPDATE public.rides
SET intermediates = '[]'::jsonb
WHERE intermediates IS NULL;

UPDATE public.rides
SET payment_method = 'money'
WHERE payment_method IS NULL OR btrim(payment_method) = '';

ALTER TABLE public.rides
  ALTER COLUMN origin SET NOT NULL,
  ALTER COLUMN destination SET NOT NULL,
  ALTER COLUMN payment_method SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS rides_request_key_unique
  ON public.rides(request_key)
  WHERE request_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS rides_passenger_status_created_idx
  ON public.rides(passenger_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS rides_dispatch_status_idx
  ON public.rides(status, search_expires_at)
  WHERE status = 'procurar_motorista';

CREATE INDEX IF NOT EXISTS rides_current_offer_driver_idx
  ON public.rides(current_offer_driver_id)
  WHERE current_offer_driver_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS rides_accepted_driver_idx
  ON public.rides(accepted_driver_id)
  WHERE accepted_driver_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cancellation_fees_ride_pending_unique
  ON public.cancellation_fees(ride_id)
  WHERE ride_id IS NOT NULL AND status IN ('pending', 'open', 'unpaid');

INSERT INTO public.app_settings (key, value, description)
VALUES (
  'ride.cancellation_policy',
  jsonb_build_object(
    'enabled', false,
    'free_seconds', 120,
    'amount', 0,
    'block_after_driver_arrival', true
  ),
  'Política configurável de cancelamento do passageiro. A cobrança permanece desativada até o valor ser definido no painel.'
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_ride_cancellation_policy()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $function$
DECLARE
  _value jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT value INTO _value
  FROM public.app_settings
  WHERE key = 'ride.cancellation_policy';

  RETURN COALESCE(
    _value,
    jsonb_build_object(
      'enabled', false,
      'free_seconds', 120,
      'amount', 0,
      'block_after_driver_arrival', true
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_passenger_ride(
  _ride_id uuid,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _auth_user_id uuid := auth.uid();
  _passenger_id uuid;
  _ride public.rides%ROWTYPE;
  _policy jsonb;
  _free_seconds integer := 120;
  _fee_amount numeric(10,2) := 0;
  _fee_enabled boolean := false;
  _block_after_arrival boolean := true;
  _elapsed_seconds integer;
  _applied_fee numeric(10,2) := 0;
  _normalized_reason text;
BEGIN
  IF _auth_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT id INTO _passenger_id
  FROM public.users
  WHERE auth_user_id = _auth_user_id OR id = _auth_user_id
  ORDER BY CASE WHEN auth_user_id = _auth_user_id THEN 0 ELSE 1 END
  LIMIT 1;

  IF _passenger_id IS NULL THEN
    RAISE EXCEPTION 'passenger_profile_missing';
  END IF;

  SELECT * INTO _ride
  FROM public.rides
  WHERE id = _ride_id AND passenger_id = _passenger_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ride_not_found';
  END IF;

  IF _ride.status IN ('finalizada', 'cancelada_passageiro', 'cancelada_motorista') THEN
    RAISE EXCEPTION 'ride_already_closed';
  END IF;

  IF _ride.status = 'em_viagem' THEN
    RAISE EXCEPTION 'ride_cancellation_blocked_in_progress';
  END IF;

  SELECT value INTO _policy
  FROM public.app_settings
  WHERE key = 'ride.cancellation_policy';

  _policy := COALESCE(_policy, '{}'::jsonb);

  IF COALESCE(_policy->>'free_seconds', '') ~ '^\d+$' THEN
    _free_seconds := GREATEST(0, LEAST(3600, (_policy->>'free_seconds')::integer));
  END IF;

  IF COALESCE(_policy->>'amount', '') ~ '^\d+(\.\d{1,2})?$' THEN
    _fee_amount := GREATEST(0, (_policy->>'amount')::numeric(10,2));
  END IF;

  _fee_enabled := lower(COALESCE(_policy->>'enabled', 'false')) IN ('true', '1', 'yes', 'sim');
  _block_after_arrival := lower(COALESCE(_policy->>'block_after_driver_arrival', 'true'))
    IN ('true', '1', 'yes', 'sim');

  IF _ride.status = 'motorista_chegou' AND _block_after_arrival THEN
    RAISE EXCEPTION 'ride_cancellation_blocked_after_arrival';
  END IF;

  _elapsed_seconds := GREATEST(
    0,
    floor(extract(epoch FROM (clock_timestamp() - _ride.created_at)))::integer
  );

  IF _fee_enabled AND _fee_amount > 0 AND _elapsed_seconds > _free_seconds THEN
    _applied_fee := _fee_amount;
  END IF;

  _normalized_reason := NULLIF(left(btrim(COALESCE(_reason, '')), 500), '');

  UPDATE public.rides
  SET status = 'cancelada_passageiro',
      cancellation_reason = COALESCE(_normalized_reason, 'Cancelada pelo passageiro'),
      cancelled_by = 'passenger',
      cancelled_at = now(),
      cancellation_fee = _applied_fee,
      candidate_driver_ids = '{}'::uuid[],
      offered_driver_ids = '{}'::uuid[],
      current_offer_driver_id = NULL,
      request_expires_at = NULL,
      search_expires_at = NULL,
      updated_at = now()
  WHERE id = _ride.id;

  IF _applied_fee > 0 THEN
    INSERT INTO public.cancellation_fees (
      ride_id,
      passenger_id,
      amount,
      reason,
      status,
      created_at,
      updated_at
    ) VALUES (
      _ride.id,
      _passenger_id,
      _applied_fee,
      COALESCE(_normalized_reason, 'Cancelamento após o período gratuito'),
      'pending',
      now(),
      now()
    )
    ON CONFLICT DO NOTHING;

    UPDATE public.passenger_wallets
    SET is_blocked = true,
        blocked_reason = format('Multa de cancelamento pendente: R$ %s', to_char(_applied_fee, 'FM999999990D00')),
        updated_at = now()
    WHERE passenger_id = _passenger_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'ride_id', _ride.id,
    'status', 'cancelada_passageiro',
    'fee_applied', _applied_fee,
    'free_seconds', _free_seconds,
    'elapsed_seconds', _elapsed_seconds
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_ride_cancellation_policy() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_passenger_ride(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ride_cancellation_policy() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_passenger_ride(uuid, text) TO authenticated, service_role;

COMMIT;
