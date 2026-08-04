-- MOVVI: preserva os detalhes de Envios/Guincho/Mudança e torna o chat
-- reproduzível em qualquer novo ambiente Supabase.

ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS service_details jsonb;

CREATE TABLE IF NOT EXISTS public.ride_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ride_messages_ride_created
  ON public.ride_messages(ride_id, created_at);

ALTER TABLE public.ride_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ride participants read messages" ON public.ride_messages;
CREATE POLICY "ride participants read messages"
  ON public.ride_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rides r
      WHERE r.id = ride_messages.ride_id
        AND auth.uid() IN (r.passenger_id, r.driver_id, r.accepted_driver_id)
    )
  );

DROP POLICY IF EXISTS "ride participants send messages" ON public.ride_messages;
CREATE POLICY "ride participants send messages"
  ON public.ride_messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.rides r
      WHERE r.id = ride_messages.ride_id
        AND auth.uid() IN (r.passenger_id, r.driver_id, r.accepted_driver_id)
        AND r.status IN ('motorista_a_caminho', 'motorista_chegou', 'em_viagem')
    )
  );

GRANT SELECT, INSERT ON public.ride_messages TO authenticated;
GRANT ALL ON public.ride_messages TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ride_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ride_messages;
  END IF;
END
$$;

SELECT 'PASSAGEIRO_SERVICOS_E_CHAT_OK' AS resultado;
