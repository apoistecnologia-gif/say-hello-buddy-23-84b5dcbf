
CREATE OR REPLACE FUNCTION public.apply_cancellation_policy()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_seconds INTEGER := NULL;
  v_fee NUMERIC(10,2) := 0;
  v_driver_credit NUMERIC(10,2) := 0;
  v_platform NUMERIC(10,2) := 0;
  v_who TEXT;
BEGIN
  IF NEW.status NOT IN ('cancelada_passageiro','cancelada_motorista') THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  v_who := CASE WHEN NEW.status = 'cancelada_passageiro' THEN 'passenger' ELSE 'driver' END;

  IF NEW.cancelled_at IS NULL THEN NEW.cancelled_at := now(); END IF;

  IF NEW.accepted_at IS NOT NULL THEN
    v_seconds := EXTRACT(EPOCH FROM (NEW.cancelled_at - NEW.accepted_at))::INTEGER;
  END IF;

  -- Only charge when passenger cancels an accepted ride
  IF v_who = 'passenger' AND NEW.accepted_at IS NOT NULL THEN
    IF OLD.status = 'motorista_chegou' THEN
      v_fee := 5.00; v_driver_credit := 4.00; v_platform := 1.00;
    ELSIF v_seconds IS NOT NULL AND v_seconds > 180 AND v_seconds <= 300 THEN
      v_fee := 3.00; v_driver_credit := 2.50; v_platform := 0.50;
    END IF;
  END IF;

  INSERT INTO public.cancellation_fees(
    ride_id, passenger_id, driver_id, cancelled_by, ride_status_at_cancel,
    seconds_since_accept, fee_amount, driver_credit, platform_fee
  ) VALUES (
    NEW.id, NEW.passenger_id, NEW.driver_id, v_who, OLD.status::text,
    v_seconds, v_fee, v_driver_credit, v_platform
  );

  IF v_fee > 0 THEN
    INSERT INTO public.passenger_wallets(passenger_id, balance, is_blocked, blocked_reason)
    VALUES (NEW.passenger_id, -v_fee, true, 'unpaid_cancellation_fee')
    ON CONFLICT (passenger_id) DO UPDATE
      SET balance = passenger_wallets.balance - v_fee,
          is_blocked = true,
          blocked_reason = 'unpaid_cancellation_fee',
          updated_at = now();

    IF NEW.driver_id IS NOT NULL AND v_driver_credit > 0 THEN
      INSERT INTO public.driver_wallet_transactions(
        driver_id, amount, status, source, source_ride_id, description
      ) VALUES (
        NEW.driver_id, v_driver_credit, 'pending', 'cancellation_fee', NEW.id,
        'Crédito pendente — cancelamento do passageiro'
      );
    END IF;

    UPDATE public.users
       SET cancel_score_30d = cancel_score_30d + 1,
           suspended_until = CASE
             WHEN cancel_score_30d + 1 >= 5 THEN now() + interval '7 days'
             WHEN cancel_score_30d + 1 >= 3 THEN now() + interval '24 hours'
             ELSE suspended_until
           END,
           updated_at = now()
     WHERE auth_user_id = NEW.passenger_id;
  END IF;

  RETURN NEW;
END;
$function$;
