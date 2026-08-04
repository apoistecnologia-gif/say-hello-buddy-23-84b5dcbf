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
  v_vehicle text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão do motorista não encontrada.';
  END IF;

  SELECT * INTO v_driver
  FROM public.drivers
  WHERE user_id = v_user;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cadastro de motorista não encontrado.';
  END IF;

  IF v_driver.approval_status <> 'aprovado'::public.driver_approval_status THEN
    RAISE EXCEPTION 'Motorista não aprovado para operar.';
  END IF;

  SELECT * INTO v_ride
  FROM public.rides
  WHERE id = _ride_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Corrida não encontrada.';
  END IF;

  IF v_ride.driver_id = v_user
     AND v_ride.status IN ('motorista_a_caminho'::public.ride_status, 'motorista_chegou'::public.ride_status, 'em_viagem'::public.ride_status) THEN
    RETURN v_ride;
  END IF;

  IF v_ride.status <> 'procurar_motorista'::public.ride_status THEN
    RAISE EXCEPTION 'Corrida não está mais disponível.';
  END IF;

  IF v_ride.current_offer_driver_id IS DISTINCT FROM v_user THEN
    RAISE EXCEPTION 'Esta chamada não está disponível para você.';
  END IF;

  v_vehicle := nullif(concat_ws(' • ',
    nullif(trim(v_driver.vehicle_color), ''),
    nullif(trim(v_driver.vehicle_model), ''),
    nullif(trim(v_driver.vehicle_plate), '')
  ), '');

  UPDATE public.rides
  SET
    driver_id = v_user,
    status = 'motorista_a_caminho'::public.ride_status,
    accepted_at = COALESCE(accepted_at, now()),
    current_offer_driver_id = NULL,
    driver_name = v_driver.name,
    driver_phone = v_driver.phone,
    driver_vehicle = v_vehicle,
    driver_lat = v_driver.current_lat,
    driver_lng = v_driver.current_lng,
    updated_at = now()
  WHERE id = _ride_id
  RETURNING * INTO v_ride;

  RETURN v_ride;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_ride_as_driver(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_ride_as_driver(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_ride_as_driver(uuid) TO service_role;