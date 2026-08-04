
-- ============ favorite_places ============
CREATE TABLE public.favorite_places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  label TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'custom', -- 'home' | 'work' | 'custom'
  address TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fav_places_user ON public.favorite_places(user_id, sort_order);
CREATE UNIQUE INDEX uq_fav_places_user_kind ON public.favorite_places(user_id, kind) WHERE kind IN ('home','work');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorite_places TO authenticated;
GRANT ALL ON public.favorite_places TO service_role;

ALTER TABLE public.favorite_places ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fav_places_owner_select" ON public.favorite_places FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "fav_places_owner_insert" ON public.favorite_places FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "fav_places_owner_update" ON public.favorite_places FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "fav_places_owner_delete" ON public.favorite_places FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER trg_fav_places_updated BEFORE UPDATE ON public.favorite_places
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ recent_places ============
CREATE TABLE public.recent_places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  address TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  place_id TEXT,
  use_count INTEGER NOT NULL DEFAULT 1,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_recent_places_user ON public.recent_places(user_id, last_used_at DESC);
CREATE UNIQUE INDEX uq_recent_places_user_addr ON public.recent_places(user_id, address);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recent_places TO authenticated;
GRANT ALL ON public.recent_places TO service_role;

ALTER TABLE public.recent_places ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recent_places_owner_all" ON public.recent_places FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ ride_tips ============
CREATE TABLE public.ride_tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  passenger_id UUID NOT NULL,
  driver_id UUID,
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_ride_tips_ride ON public.ride_tips(ride_id);
CREATE INDEX idx_ride_tips_driver ON public.ride_tips(driver_id);

GRANT SELECT, INSERT ON public.ride_tips TO authenticated;
GRANT ALL ON public.ride_tips TO service_role;

ALTER TABLE public.ride_tips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ride_tips_passenger_insert" ON public.ride_tips FOR INSERT TO authenticated
  WITH CHECK (passenger_id = auth.uid());
CREATE POLICY "ride_tips_view" ON public.ride_tips FOR SELECT TO authenticated
  USING (
    passenger_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.rides r WHERE r.id = ride_id AND r.driver_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- ============ support_ticket_attachments ============
CREATE TABLE public.support_ticket_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_support_attach_ticket ON public.support_ticket_attachments(ticket_id);

GRANT SELECT, INSERT, DELETE ON public.support_ticket_attachments TO authenticated;
GRANT ALL ON public.support_ticket_attachments TO service_role;

ALTER TABLE public.support_ticket_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_attach_owner_view" ON public.support_ticket_attachments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "support_attach_owner_insert" ON public.support_ticket_attachments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "support_attach_owner_delete" ON public.support_ticket_attachments FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
