
CREATE TABLE public.gps_diagnostics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  event TEXT NOT NULL,
  code TEXT,
  message TEXT,
  user_agent TEXT,
  url TEXT,
  extra JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.gps_diagnostics TO authenticated;
GRANT INSERT ON public.gps_diagnostics TO anon;
GRANT ALL ON public.gps_diagnostics TO service_role;

ALTER TABLE public.gps_diagnostics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can insert their own gps diag"
  ON public.gps_diagnostics FOR INSERT
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "admins can read gps diag"
  ON public.gps_diagnostics FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_gps_diag_created ON public.gps_diagnostics (created_at DESC);
CREATE INDEX idx_gps_diag_user ON public.gps_diagnostics (user_id, created_at DESC);
