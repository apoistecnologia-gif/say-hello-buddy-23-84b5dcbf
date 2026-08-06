-- APOIS Passageiro — solicitações de suporte com protocolo

BEGIN;

CREATE TABLE IF NOT EXISTS public.passenger_support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  category text NOT NULL,
  subject text NOT NULL,
  message text NOT NULL,
  ride_id uuid REFERENCES public.rides(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'normal',
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE INDEX IF NOT EXISTS passenger_support_tickets_passenger_idx
  ON public.passenger_support_tickets(passenger_id, created_at DESC);

ALTER TABLE public.passenger_support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS passenger_support_tickets_select_own ON public.passenger_support_tickets;
CREATE POLICY passenger_support_tickets_select_own
ON public.passenger_support_tickets
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users profile
    WHERE profile.id = passenger_support_tickets.passenger_id
      AND (profile.auth_user_id = auth.uid() OR profile.id = auth.uid())
  )
);

COMMIT;
