CREATE POLICY users_select_passenger_for_active_offer_or_ride
ON public.users
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.rides r
    WHERE r.passenger_id = users.auth_user_id
      AND (
        (r.current_offer_driver_id = auth.uid()
          AND r.status = 'procurar_motorista'::ride_status)
        OR (r.driver_id = auth.uid()
          AND r.status = ANY (ARRAY[
            'motorista_a_caminho'::ride_status,
            'motorista_chegou'::ride_status,
            'em_viagem'::ride_status
          ]))
      )
  )
);