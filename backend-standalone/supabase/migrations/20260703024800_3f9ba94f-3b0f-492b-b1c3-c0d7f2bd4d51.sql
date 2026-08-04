
CREATE TABLE IF NOT EXISTS public.admin_subscription_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  admin_user_id UUID NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_subscription_notes TO authenticated;
GRANT ALL ON public.admin_subscription_notes TO service_role;

ALTER TABLE public.admin_subscription_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view subscription notes"
  ON public.admin_subscription_notes FOR SELECT
  TO authenticated
  USING (private.is_admin(auth.uid()));

CREATE POLICY "Admins can insert subscription notes"
  ON public.admin_subscription_notes FOR INSERT
  TO authenticated
  WITH CHECK (private.is_admin(auth.uid()) AND admin_user_id = auth.uid());

CREATE POLICY "Admins can delete subscription notes"
  ON public.admin_subscription_notes FOR DELETE
  TO authenticated
  USING (private.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_admin_subscription_notes_sub ON public.admin_subscription_notes(subscription_id, created_at DESC);
