-- Passo 1: Consolidar o enum de status da corrida com nomes oficiais em pt-BR
-- Migra os valores existentes para o novo conjunto canonico.

ALTER TYPE public.ride_status RENAME TO ride_status_old;

CREATE TYPE public.ride_status AS ENUM (
  'procurar_motorista',
  'motorista_a_caminho',
  'motorista_chegou',
  'em_viagem',
  'finalizada',
  'cancelada_passageiro',
  'cancelada_motorista'
);

-- Coluna temporaria com o novo tipo
ALTER TABLE public.rides ADD COLUMN status_new public.ride_status;

UPDATE public.rides SET status_new = CASE
  WHEN status::text IN ('searching_driver','offered_to_driver','no_driver_available') THEN 'procurar_motorista'::public.ride_status
  WHEN status::text = 'driver_assigned' THEN 'motorista_a_caminho'::public.ride_status
  WHEN status::text = 'driver_arrived' THEN 'motorista_chegou'::public.ride_status
  WHEN status::text = 'in_progress'    THEN 'em_viagem'::public.ride_status
  WHEN status::text = 'completed'      THEN 'finalizada'::public.ride_status
  WHEN status::text = 'cancelled' AND cancelled_by IS NOT NULL AND cancelled_by = passenger_id THEN 'cancelada_passageiro'::public.ride_status
  WHEN status::text = 'cancelled'      THEN 'cancelada_motorista'::public.ride_status
  ELSE 'procurar_motorista'::public.ride_status
END;

ALTER TABLE public.rides ALTER COLUMN status DROP DEFAULT;
DROP INDEX IF EXISTS public.idx_rides_status;
ALTER TABLE public.rides DROP COLUMN status;
ALTER TABLE public.rides RENAME COLUMN status_new TO status;
ALTER TABLE public.rides ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.rides ALTER COLUMN status SET DEFAULT 'procurar_motorista'::public.ride_status;
CREATE INDEX idx_rides_status ON public.rides(status);

DROP TYPE public.ride_status_old;