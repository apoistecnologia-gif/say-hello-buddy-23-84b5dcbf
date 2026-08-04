
-- 1) Extend support_tickets with priority + internal note field
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS admin_status_note text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_tickets_priority_chk'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_priority_chk
      CHECK (priority IN ('low','normal','high','urgent'));
  END IF;
END $$;

-- 2) Admin RLS on support_tickets (read + update)
DROP POLICY IF EXISTS "admins read tickets" ON public.support_tickets;
CREATE POLICY "admins read tickets"
  ON public.support_tickets FOR SELECT
  TO authenticated
  USING (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admins update tickets" ON public.support_tickets;
CREATE POLICY "admins update tickets"
  ON public.support_tickets FOR UPDATE
  TO authenticated
  USING (private.is_admin(auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()));

-- 3) support_ticket_notes (internal admin notes)
CREATE TABLE IF NOT EXISTS public.support_ticket_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_ticket_notes TO authenticated;
GRANT ALL ON public.support_ticket_notes TO service_role;

ALTER TABLE public.support_ticket_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read ticket notes" ON public.support_ticket_notes;
CREATE POLICY "admins read ticket notes"
  ON public.support_ticket_notes FOR SELECT
  TO authenticated
  USING (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admins insert ticket notes" ON public.support_ticket_notes;
CREATE POLICY "admins insert ticket notes"
  ON public.support_ticket_notes FOR INSERT
  TO authenticated
  WITH CHECK (private.is_admin(auth.uid()) AND admin_id = auth.uid());

DROP POLICY IF EXISTS "admins delete ticket notes" ON public.support_ticket_notes;
CREATE POLICY "admins delete ticket notes"
  ON public.support_ticket_notes FOR DELETE
  TO authenticated
  USING (private.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_support_ticket_notes_ticket
  ON public.support_ticket_notes(ticket_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status
  ON public.support_tickets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority
  ON public.support_tickets(priority);
