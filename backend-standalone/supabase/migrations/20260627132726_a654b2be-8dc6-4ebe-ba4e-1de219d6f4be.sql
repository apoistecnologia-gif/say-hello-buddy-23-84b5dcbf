ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS current_heading DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS current_speed DOUBLE PRECISION;

DROP POLICY IF EXISTS "drivers_select_for_active_ride_passenger" ON public.drivers;
CREATE POLICY "drivers_select_for_active_ride_passenger" ON public.drivers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rides r
      WHERE r.driver_id = public.drivers.user_id
        AND r.passenger_id = auth.uid()
        AND r.status IN ('motorista_a_caminho','motorista_chegou','em_viagem')
    )
  );
