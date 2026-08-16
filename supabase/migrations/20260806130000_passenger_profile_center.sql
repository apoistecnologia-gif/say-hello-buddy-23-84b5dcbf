-- APOIS Passageiro — central de perfil, preferências e contatos de emergência

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text;

CREATE TABLE IF NOT EXISTS public.passenger_emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  relationship text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.passenger_emergency_contacts
  ADD COLUMN IF NOT EXISTS relationship text,
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS passenger_emergency_contacts_user_idx
  ON public.passenger_emergency_contacts(passenger_user_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS passenger_emergency_contacts_one_primary_idx
  ON public.passenger_emergency_contacts(passenger_user_id)
  WHERE is_primary;

ALTER TABLE public.passenger_emergency_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS passenger_emergency_contacts_select_own ON public.passenger_emergency_contacts;
CREATE POLICY passenger_emergency_contacts_select_own
ON public.passenger_emergency_contacts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users profile
    WHERE profile.id = passenger_emergency_contacts.passenger_user_id
      AND (profile.auth_user_id = auth.uid() OR profile.id = auth.uid())
  )
);

DROP POLICY IF EXISTS passenger_emergency_contacts_insert_own ON public.passenger_emergency_contacts;
CREATE POLICY passenger_emergency_contacts_insert_own
ON public.passenger_emergency_contacts
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users profile
    WHERE profile.id = passenger_emergency_contacts.passenger_user_id
      AND (profile.auth_user_id = auth.uid() OR profile.id = auth.uid())
  )
);

DROP POLICY IF EXISTS passenger_emergency_contacts_update_own ON public.passenger_emergency_contacts;
CREATE POLICY passenger_emergency_contacts_update_own
ON public.passenger_emergency_contacts
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users profile
    WHERE profile.id = passenger_emergency_contacts.passenger_user_id
      AND (profile.auth_user_id = auth.uid() OR profile.id = auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users profile
    WHERE profile.id = passenger_emergency_contacts.passenger_user_id
      AND (profile.auth_user_id = auth.uid() OR profile.id = auth.uid())
  )
);

DROP POLICY IF EXISTS passenger_emergency_contacts_delete_own ON public.passenger_emergency_contacts;
CREATE POLICY passenger_emergency_contacts_delete_own
ON public.passenger_emergency_contacts
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users profile
    WHERE profile.id = passenger_emergency_contacts.passenger_user_id
      AND (profile.auth_user_id = auth.uid() OR profile.id = auth.uid())
  )
);

ALTER TABLE public.user_notification_preferences
  ADD COLUMN IF NOT EXISTS safety_alerts boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payment_updates boolean NOT NULL DEFAULT true;

COMMIT;
