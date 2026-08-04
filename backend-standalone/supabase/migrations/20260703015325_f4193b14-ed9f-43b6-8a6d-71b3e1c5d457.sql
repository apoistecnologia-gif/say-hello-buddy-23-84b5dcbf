
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS user_type text NOT NULL DEFAULT 'passenger';

ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_user_type_check
  CHECK (user_type IN ('passenger','driver'));
