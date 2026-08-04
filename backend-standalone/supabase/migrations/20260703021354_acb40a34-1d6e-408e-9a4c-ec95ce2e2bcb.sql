CREATE TABLE IF NOT EXISTS public.admin_passenger_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_passenger_notes TO authenticated;
GRANT ALL ON public.admin_passenger_notes TO service_role;

ALTER TABLE public.admin_passenger_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read passenger notes" ON public.admin_passenger_notes;
CREATE POLICY "Admins read passenger notes" ON public.admin_passenger_notes
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

DROP POLICY IF EXISTS "Admins insert passenger notes" ON public.admin_passenger_notes;
CREATE POLICY "Admins insert passenger notes" ON public.admin_passenger_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    admin_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins delete passenger notes" ON public.admin_passenger_notes;
CREATE POLICY "Admins delete passenger notes" ON public.admin_passenger_notes
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

CREATE INDEX IF NOT EXISTS idx_admin_passenger_notes_pass ON public.admin_passenger_notes(passenger_id, created_at DESC);