-- APOIS/MOVVI — correção de produção do ciclo aceitar/rejeitar.
-- Auditoria de 2026-08-01.
--
-- Causas corrigidas:
-- 1) O backend usa queued_after_ride_id/queued_at, mas essas colunas não
--    existiam em nenhuma migration enviada.
-- 2) Havia divergência entre drivers.subscription_status e a tabela
--    subscriptions, que é a fonte real de elegibilidade.
-- 3) Mantém a função pública de verificação alinhada ao critério pago.

ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS queued_after_ride_id uuid NULL,
  ADD COLUMN IF NOT EXISTS queued_at timestamptz NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'rides_queued_after_ride_id_fkey'
       AND conrelid = 'public.rides'::regclass
  ) THEN
    ALTER TABLE public.rides
      ADD CONSTRAINT rides_queued_after_ride_id_fkey
      FOREIGN KEY (queued_after_ride_id)
      REFERENCES public.rides(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_rides_driver_queue
  ON public.rides(driver_id, queued_after_ride_id, created_at DESC)
  WHERE queued_after_ride_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rides_pending_candidates
  ON public.rides(status, request_expires_at)
  WHERE status = 'procurar_motorista'::public.ride_status
    AND accepted_driver_id IS NULL;

-- Converte apenas direitos legados que JÁ estavam marcados como ativos e
-- possuíam validade futura. Não ativa motoristas inativos ou vencidos.
INSERT INTO public.subscriptions (
  driver_id,
  status,
  amount,
  period_start,
  period_end,
  paid_at,
  payment_method,
  provider_reference,
  created_at,
  updated_at
)
SELECT
  d.user_id,
  'active'::public.driver_subscription_status,
  COALESCE(NULLIF(d.subscription_value, 0), 49.90),
  now(),
  d.subscription_expires_at,
  now(),
  'legacy_migration',
  'legacy-active-backfill:' || d.user_id::text,
  now(),
  now()
FROM public.drivers d
WHERE d.subscription_status::text = 'active'
  AND d.subscription_expires_at IS NOT NULL
  AND d.subscription_expires_at > now()
  AND NOT EXISTS (
    SELECT 1
      FROM public.subscriptions s
     WHERE s.driver_id = d.user_id
       AND s.status::text = 'active'
       AND s.paid_at IS NOT NULL
       AND s.period_end > now()
  );

CREATE OR REPLACE FUNCTION public.driver_subscription_is_current(
  _driver_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.subscriptions s
     WHERE s.driver_id = _driver_user_id
       AND s.status::text = 'active'
       AND s.paid_at IS NOT NULL
       AND COALESCE(s.period_start, '-infinity'::timestamptz) <= now()
       AND s.period_end IS NOT NULL
       AND s.period_end > now()
  );
$$;

REVOKE ALL ON FUNCTION public.driver_subscription_is_current(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_subscription_is_current(uuid)
  TO authenticated, service_role;

-- Recria o aceite atômico para clientes que ainda chamem a RPC diretamente.
CREATE OR REPLACE FUNCTION public.accept_ride_as_driver(_ride_id uuid)
RETURNS public.rides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_driver public.drivers%ROWTYPE;
  v_ride public.rides%ROWTYPE;
  v_active public.rides%ROWTYPE;
  v_has_active boolean := false;
  v_vehicle text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão do motorista não encontrada.';
  END IF;

  SELECT *
    INTO v_driver
    FROM public.drivers
   WHERE user_id = v_user;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cadastro de motorista não encontrado.';
  END IF;

  IF v_driver.approval_status::text <> 'aprovado' THEN
    RAISE EXCEPTION 'Motorista não aprovado para operar.';
  END IF;

  IF NOT COALESCE(v_driver.is_online, false)
     OR v_driver.current_lat IS NULL
     OR v_driver.current_lng IS NULL
     OR v_driver.last_location_at IS NULL
     OR v_driver.last_location_at < now() - interval '2 minutes' THEN
    RAISE EXCEPTION 'Fique online com o GPS ativo antes de aceitar.';
  END IF;

  IF NOT public.driver_subscription_is_current(v_user) THEN
    RAISE EXCEPTION 'Mensalidade vencida. Regularize o plano antes de aceitar.';
  END IF;

  SELECT *
    INTO v_ride
    FROM public.rides
   WHERE id = _ride_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Corrida não encontrada.';
  END IF;

  IF v_ride.driver_id = v_user
     AND v_ride.status::text IN (
       'motorista_a_caminho',
       'motorista_chegou',
       'em_viagem'
     ) THEN
    RETURN v_ride;
  END IF;

  IF v_ride.status::text <> 'procurar_motorista'
     OR v_ride.accepted_driver_id IS NOT NULL THEN
    RAISE EXCEPTION 'Corrida não está mais disponível.';
  END IF;

  IF NOT (
    v_user = ANY(COALESCE(v_ride.candidate_driver_ids, ARRAY[]::uuid[]))
  ) OR v_user = ANY(
    COALESCE(v_ride.rejected_driver_ids, ARRAY[]::uuid[])
  ) THEN
    RAISE EXCEPTION 'Esta chamada não está disponível para você.';
  END IF;

  IF v_ride.request_expires_at IS NULL
     OR v_ride.request_expires_at <= now() THEN
    RAISE EXCEPTION 'A oferta expirou.';
  END IF;

  SELECT *
    INTO v_active
    FROM public.rides
   WHERE driver_id = v_user
     AND queued_after_ride_id IS NULL
     AND status::text IN (
       'motorista_a_caminho',
       'motorista_chegou',
       'em_viagem'
     )
   ORDER BY created_at DESC
   LIMIT 1;

  v_has_active := FOUND;

  IF v_has_active AND v_active.status::text <> 'em_viagem' THEN
    RAISE EXCEPTION 'Finalize o embarque atual antes de aceitar outra corrida.';
  END IF;

  IF v_has_active AND EXISTS (
    SELECT 1
      FROM public.rides q
     WHERE q.driver_id = v_user
       AND q.queued_after_ride_id IS NOT NULL
       AND q.status::text IN (
         'motorista_a_caminho',
         'motorista_chegou',
         'em_viagem'
       )
  ) THEN
    RAISE EXCEPTION 'Você já possui uma próxima corrida aceita.';
  END IF;

  v_vehicle := NULLIF(CONCAT_WS(
    ' • ',
    NULLIF(TRIM(v_driver.vehicle_color), ''),
    NULLIF(TRIM(v_driver.vehicle_model), ''),
    NULLIF(TRIM(v_driver.vehicle_plate), '')
  ), '');

  UPDATE public.rides
     SET driver_id = v_user,
         accepted_driver_id = v_user,
         status = 'motorista_a_caminho',
         accepted_at = COALESCE(accepted_at, now()),
         current_offer_driver_id = NULL,
         offered_driver_ids = ARRAY[]::uuid[],
         driver_name = v_driver.name,
         driver_phone = v_driver.phone,
         driver_vehicle = v_vehicle,
         driver_lat = v_driver.current_lat,
         driver_lng = v_driver.current_lng,
         safety_code = COALESCE(
           safety_code,
           (1000 + floor(random() * 9000))::int::text
         ),
         queued_after_ride_id = CASE WHEN v_has_active THEN v_active.id ELSE NULL END,
         queued_at = CASE WHEN v_has_active THEN now() ELSE NULL END,
         updated_at = now()
   WHERE id = _ride_id
     AND status::text = 'procurar_motorista'
     AND accepted_driver_id IS NULL
   RETURNING * INTO v_ride;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Outro motorista aceitou esta corrida primeiro.';
  END IF;

  RETURN v_ride;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_ride_as_driver(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_ride_as_driver(uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
