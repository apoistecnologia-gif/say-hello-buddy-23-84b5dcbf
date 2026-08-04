
CREATE TABLE IF NOT EXISTS public.admin_driver_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_driver_notes TO authenticated;
GRANT ALL ON public.admin_driver_notes TO service_role;

ALTER TABLE public.admin_driver_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read driver notes" ON public.admin_driver_notes;
CREATE POLICY "Admins can read driver notes" ON public.admin_driver_notes
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

DROP POLICY IF EXISTS "Admins can insert driver notes" ON public.admin_driver_notes;
CREATE POLICY "Admins can insert driver notes" ON public.admin_driver_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    admin_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can delete driver notes" ON public.admin_driver_notes;
CREATE POLICY "Admins can delete driver notes" ON public.admin_driver_notes
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

CREATE INDEX IF NOT EXISTS idx_admin_driver_notes_driver ON public.admin_driver_notes(driver_id, created_at DESC);
