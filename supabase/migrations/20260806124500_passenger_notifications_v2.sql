-- APOIS Passageiro — caixa de entrada funcional e independente do token push

BEGIN;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_passenger_select ON public.notifications;
CREATE POLICY notifications_passenger_select
ON public.notifications
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.users profile
    WHERE profile.id = notifications.user_id
      AND profile.auth_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS notifications_passenger_update ON public.notifications;
CREATE POLICY notifications_passenger_update
ON public.notifications
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.users profile
    WHERE profile.id = notifications.user_id
      AND profile.auth_user_id = auth.uid()
  )
)
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.users profile
    WHERE profile.id = notifications.user_id
      AND profile.auth_user_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.notify_passenger_ride_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _title text;
  _body text;
  _url text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  CASE NEW.status::text
    WHEN 'procurar_motorista' THEN
      _title := 'Procurando motorista';
      _body := 'Sua solicitação foi enviada. Avisaremos quando um motorista aceitar.';
      _url := format('/corrida/%s', NEW.id);
    WHEN 'motorista_a_caminho' THEN
      _title := 'Motorista encontrado';
      _body := 'Um motorista aceitou sua corrida e está a caminho do embarque.';
      _url := format('/corrida/%s', NEW.id);
    WHEN 'motorista_chegou' THEN
      _title := 'Seu motorista chegou';
      _body := 'Confira o veículo e informe o PIN antes de iniciar a viagem.';
      _url := format('/corrida/%s', NEW.id);
    WHEN 'em_viagem' THEN
      _title := 'Corrida iniciada';
      _body := 'Acompanhe o trajeto e os recursos de segurança pelo aplicativo.';
      _url := format('/corrida/%s', NEW.id);
    WHEN 'finalizada' THEN
      _title := 'Você chegou ao destino';
      _body := 'A corrida foi concluída. Confira o comprovante e avalie o motorista.';
      _url := format('/corridas/%s', NEW.id);
    WHEN 'cancelada_passageiro' THEN
      _title := 'Corrida cancelada';
      _body := CASE
        WHEN COALESCE(NEW.cancellation_fee, 0) > 0
          THEN 'A corrida foi cancelada e uma multa foi registrada na sua carteira.'
        ELSE 'A corrida foi cancelada por você.'
      END;
      _url := CASE
        WHEN COALESCE(NEW.cancellation_fee, 0) > 0 THEN '/carteira'
        ELSE format('/corridas/%s', NEW.id)
      END;
    WHEN 'cancelada_motorista' THEN
      _title := 'Motorista cancelou a corrida';
      _body := 'A corrida foi cancelada pelo motorista. Você pode solicitar outra corrida.';
      _url := format('/corridas/%s', NEW.id);
    WHEN 'expired' THEN
      _title := 'Não encontramos motorista';
      _body := 'A busca terminou sem aceite. Tente novamente quando desejar.';
      _url := format('/corridas/%s', NEW.id);
    ELSE
      RETURN NEW;
  END CASE;

  INSERT INTO public.notifications (user_id, title, body, data)
  SELECT
    NEW.passenger_id,
    _title,
    _body,
    jsonb_build_object(
      'category', 'ride_update',
      'ride_id', NEW.id,
      'status', NEW.status::text,
      'url', _url
    )
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.notifications existing
    WHERE existing.user_id = NEW.passenger_id
      AND existing.data->>'ride_id' = NEW.id::text
      AND existing.data->>'status' = NEW.status::text
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS rides_notify_passenger_status ON public.rides;
CREATE TRIGGER rides_notify_passenger_status
AFTER INSERT OR UPDATE OF status
ON public.rides
FOR EACH ROW
EXECUTE FUNCTION public.notify_passenger_ride_status();

CREATE OR REPLACE FUNCTION public.notify_passenger_cancellation_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _amount numeric(10,2) := GREATEST(0, COALESCE(NEW.amount, NEW.fee_amount, NEW.value, 0));
  _event text;
  _title text;
  _body text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _event := 'created';
    _title := 'Multa de cancelamento registrada';
    _body := format('Existe uma pendência de R$ %s na sua carteira.', to_char(_amount, 'FM999999990D00'));
  ELSIF NEW.is_paid AND NOT COALESCE(OLD.is_paid, false) THEN
    _event := 'paid';
    _title := 'Pagamento confirmado';
    _body := 'A multa foi quitada. Se não houver outra pendência, sua carteira já está liberada.';
  ELSIF NOT NEW.is_paid AND COALESCE(OLD.is_paid, false) THEN
    _event := 'reversed';
    _title := 'Pagamento estornado';
    _body := 'O pagamento da multa foi estornado e a pendência voltou para sua carteira.';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, title, body, data)
  SELECT
    NEW.passenger_id,
    _title,
    _body,
    jsonb_build_object(
      'category', 'wallet',
      'fee_id', NEW.id,
      'ride_id', NEW.ride_id,
      'event', _event,
      'url', '/carteira'
    )
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.notifications existing
    WHERE existing.user_id = NEW.passenger_id
      AND existing.data->>'fee_id' = NEW.id::text
      AND existing.data->>'event' = _event
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS cancellation_fees_notify_passenger ON public.cancellation_fees;
CREATE TRIGGER cancellation_fees_notify_passenger
AFTER INSERT OR UPDATE OF status, is_paid
ON public.cancellation_fees
FOR EACH ROW
EXECUTE FUNCTION public.notify_passenger_cancellation_fee();

COMMIT;
