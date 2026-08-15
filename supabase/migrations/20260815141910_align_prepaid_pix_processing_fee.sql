-- Keep the passenger-paid processing fee separate from the ride fare.
-- Driver earning remains 100% of the ride fare and the platform ride commission remains zero.
-- Legacy Pix rides without a financial snapshot continue to validate against estimated_price.

CREATE OR REPLACE FUNCTION public.activate_prepaid_pix_ride(_ride_id uuid, _provider_payment_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_ride public.rides%rowtype;
  v_payment public.ride_pix_payments%rowtype;
  v_expected_cents bigint;
  v_transitioned boolean := false;
  v_provider text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING errcode='42501';
  END IF;
  IF _ride_id IS NULL OR nullif(btrim(_provider_payment_id),'') IS NULL THEN
    RAISE EXCEPTION 'invalid_payment_identity' USING errcode='22023';
  END IF;

  SELECT * INTO v_ride FROM public.rides WHERE id=_ride_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ride_not_found' USING errcode='P0002'; END IF;
  IF lower(coalesce(v_ride.payment_method,'')) <> 'pix' THEN
    RAISE EXCEPTION 'ride_payment_method_not_pix' USING errcode='22023';
  END IF;

  SELECT * INTO v_payment
  FROM public.ride_pix_payments
  WHERE ride_id=_ride_id AND provider_payment_id=_provider_payment_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ride_pix_payment_not_found' USING errcode='P0002'; END IF;
  IF v_payment.status <> 'received' THEN
    RAISE EXCEPTION 'ride_pix_payment_not_received' USING errcode='55000';
  END IF;

  v_provider := nullif(lower(btrim(coalesce(v_payment.provider,''))), '');
  IF v_provider IS NULL THEN
    RAISE EXCEPTION 'ride_pix_provider_missing' USING errcode='22023';
  END IF;

  v_expected_cents := coalesce(
    v_ride.passenger_charge_cents,
    round(v_ride.estimated_price * 100)::bigint
  );
  IF v_expected_cents IS NULL OR v_expected_cents <= 0 THEN
    RAISE EXCEPTION 'invalid_ride_passenger_charge' USING errcode='22023';
  END IF;
  IF v_payment.amount_cents <> v_expected_cents THEN
    RAISE EXCEPTION 'ride_pix_amount_mismatch' USING errcode='22023';
  END IF;

  IF v_ride.provider_payment_id IS NOT NULL
     AND v_ride.provider_payment_id <> _provider_payment_id THEN
    RETURN jsonb_build_object(
      'ok', true,
      'stale_payment', true,
      'ride_id', v_ride.id,
      'status', v_ride.status,
      'payment_status', v_ride.payment_status
    );
  END IF;

  IF v_ride.payment_status = 'paid' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'ride_id', v_ride.id,
      'status', v_ride.status,
      'payment_status', v_ride.payment_status,
      'payment_provider', v_ride.payment_provider,
      'should_dispatch', (v_ride.status='procurar_motorista' AND coalesce(v_ride.dispatch_attempts,0)=0)
    );
  END IF;

  IF v_ride.status <> 'aguardando_pagamento' THEN
    RAISE EXCEPTION 'ride_not_awaiting_payment' USING errcode='55000';
  END IF;

  UPDATE public.rides
  SET payment_status='paid',
      payment_provider=v_provider,
      provider_payment_id=_provider_payment_id,
      payment_confirmed_at=coalesce(payment_confirmed_at,now()),
      status='procurar_motorista',
      search_expires_at=now()+interval '180 seconds',
      updated_at=now()
  WHERE id=_ride_id
  RETURNING * INTO v_ride;
  v_transitioned := true;

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'transitioned', v_transitioned,
    'ride_id', v_ride.id,
    'status', v_ride.status,
    'payment_status', v_ride.payment_status,
    'payment_provider', v_ride.payment_provider,
    'should_dispatch', true
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_ride_settlement(_ride_id uuid)
RETURNS public.ride_settlements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ride public.rides%rowtype;
  v_settlement public.ride_settlements%rowtype;
  v_payment public.ride_pix_payments%rowtype;
  v_amount numeric(12,2);
  v_payment_method text;
  v_payment_status text;
  v_inserted_tx uuid;
  v_provider_fee numeric(12,2) := 0;
  v_provider text;
  v_fare_cents bigint;
  v_processing_fee_cents bigint;
  v_passenger_charge_cents bigint;
  v_fare_amount numeric(12,2);
  v_processing_fee numeric(12,2);
  v_passenger_charge numeric(12,2);
  v_has_snapshot boolean := false;
BEGIN
  SELECT * INTO v_ride
  FROM public.rides
  WHERE id = _ride_id
  FOR SHARE;

  IF NOT FOUND THEN RAISE EXCEPTION 'ride_not_found'; END IF;
  IF v_ride.status::text <> 'finalizada' THEN RAISE EXCEPTION 'ride_not_completed'; END IF;
  IF v_ride.driver_id IS NULL THEN RAISE EXCEPTION 'ride_driver_missing'; END IF;

  v_amount := coalesce(v_ride.final_price, v_ride.estimated_price);
  IF v_amount IS NULL OR v_amount <= 0 THEN RAISE EXCEPTION 'invalid_completed_ride_amount'; END IF;

  v_payment_method := lower(trim(coalesce(v_ride.payment_method, '')));
  IF v_payment_method = '' THEN RAISE EXCEPTION 'ride_payment_method_missing'; END IF;

  IF v_payment_method = 'pix' THEN
    IF v_ride.payment_status <> 'paid' OR v_ride.provider_payment_id IS NULL THEN
      RAISE EXCEPTION 'prepaid_pix_not_confirmed';
    END IF;

    SELECT * INTO v_payment
    FROM public.ride_pix_payments
    WHERE ride_id = v_ride.id
      AND provider_payment_id = v_ride.provider_payment_id
      AND status = 'received'
    ORDER BY attempt_number DESC
    LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'prepaid_pix_receipt_missing'; END IF;

    v_provider := nullif(lower(btrim(coalesce(v_payment.provider,''))), '');
    IF v_provider IS NULL THEN RAISE EXCEPTION 'prepaid_pix_provider_missing'; END IF;
    IF nullif(lower(btrim(coalesce(v_ride.payment_provider,''))), '') IS DISTINCT FROM v_provider THEN
      RAISE EXCEPTION 'prepaid_pix_provider_mismatch';
    END IF;

    v_has_snapshot := v_ride.fare_amount_cents IS NOT NULL
                      OR v_ride.processing_fee_cents IS NOT NULL
                      OR v_ride.passenger_charge_cents IS NOT NULL;

    IF v_has_snapshot THEN
      IF v_ride.fare_amount_cents IS NULL
         OR v_ride.processing_fee_cents IS NULL
         OR v_ride.passenger_charge_cents IS NULL THEN
        RAISE EXCEPTION 'incomplete_ride_financial_snapshot';
      END IF;
      IF v_ride.fare_amount_cents <= 0
         OR v_ride.processing_fee_cents < 0
         OR v_ride.passenger_charge_cents <= 0
         OR v_ride.passenger_charge_cents <> v_ride.fare_amount_cents + v_ride.processing_fee_cents THEN
        RAISE EXCEPTION 'invalid_ride_financial_snapshot';
      END IF;
      IF round(v_amount * 100)::bigint <> v_ride.fare_amount_cents THEN
        RAISE EXCEPTION 'prepaid_pix_fare_snapshot_mismatch';
      END IF;
      v_fare_cents := v_ride.fare_amount_cents;
      v_processing_fee_cents := v_ride.processing_fee_cents;
      v_passenger_charge_cents := v_ride.passenger_charge_cents;
    ELSE
      v_fare_cents := round(v_amount * 100)::bigint;
      v_processing_fee_cents := 0;
      v_passenger_charge_cents := v_fare_cents;
    END IF;

    IF v_payment.amount_cents <> v_passenger_charge_cents THEN
      RAISE EXCEPTION 'prepaid_pix_amount_mismatch';
    END IF;

    v_fare_amount := round(v_fare_cents::numeric / 100, 2);
    v_processing_fee := round(v_processing_fee_cents::numeric / 100, 2);
    v_passenger_charge := round(v_passenger_charge_cents::numeric / 100, 2);
    v_provider_fee := round(coalesce(v_payment.provider_fee_cents,0)::numeric / 100, 2);

    INSERT INTO public.ride_settlements (
      ride_id, passenger_id, driver_id, gross_amount, discount_amount,
      passenger_charge, platform_fee, driver_earning, payment_provider_fee,
      cash_amount, wallet_amount, refunded_amount,
      payment_method, payment_provider, provider_payment_id,
      payment_status, status, settled_at, created_at, updated_at, processing_fee
    ) VALUES (
      v_ride.id, v_ride.passenger_id, v_ride.driver_id, v_fare_amount, 0,
      v_passenger_charge, 0, v_fare_amount, v_provider_fee,
      0, 0, 0,
      'pix', v_provider, v_ride.provider_payment_id,
      'confirmed', 'settled', now(), coalesce(v_ride.completed_at,now()), now(), v_processing_fee
    )
    ON CONFLICT (ride_id) DO UPDATE SET
      driver_id = excluded.driver_id,
      gross_amount = excluded.gross_amount,
      passenger_charge = excluded.passenger_charge,
      processing_fee = excluded.processing_fee,
      platform_fee = 0,
      driver_earning = excluded.driver_earning,
      payment_provider_fee = excluded.payment_provider_fee,
      payment_method = 'pix',
      payment_provider = excluded.payment_provider,
      provider_payment_id = excluded.provider_payment_id,
      payment_status = 'confirmed',
      status = 'settled',
      settled_at = coalesce(public.ride_settlements.settled_at,now()),
      updated_at = now();

    INSERT INTO public.driver_wallets(driver_id,balance,available_balance,created_at,updated_at)
    VALUES(v_ride.driver_id,0,0,now(),now())
    ON CONFLICT(driver_id) DO NOTHING;

    INSERT INTO public.driver_wallet_transactions(driver_id,amount,direction,source,source_id,description)
    VALUES(v_ride.driver_id,v_fare_amount,'credit','ride',v_ride.id,'Corrida Pix pré-paga concluída')
    ON CONFLICT(driver_id,source,source_id) DO NOTHING
    RETURNING id INTO v_inserted_tx;

    IF v_inserted_tx IS NOT NULL THEN
      UPDATE public.driver_wallets
      SET balance=balance+v_fare_amount,
          available_balance=available_balance+v_fare_amount,
          updated_at=now()
      WHERE driver_id=v_ride.driver_id;
    END IF;
  ELSE
    v_payment_status := CASE
      WHEN v_payment_method IN ('cash','dinheiro','money') THEN 'cash_pending'
      ELSE 'pending'
    END;

    INSERT INTO public.ride_settlements (
      ride_id, passenger_id, driver_id, gross_amount, passenger_charge,
      payment_method, payment_status, status, created_at, updated_at
    ) VALUES (
      v_ride.id, v_ride.passenger_id, v_ride.driver_id, v_amount, v_amount,
      v_payment_method, v_payment_status, 'awaiting_payment',
      coalesce(v_ride.completed_at, now()), now()
    )
    ON CONFLICT (ride_id) DO NOTHING;
  END IF;

  SELECT * INTO v_settlement
  FROM public.ride_settlements
  WHERE ride_id = v_ride.id;
  RETURN v_settlement;
END;
$function$;
