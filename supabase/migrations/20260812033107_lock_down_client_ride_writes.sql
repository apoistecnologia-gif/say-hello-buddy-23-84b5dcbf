-- Ride lifecycle, pricing and payment fields are backend-controlled.
-- Clients retain SELECT through RLS for their own/relevant rides, but cannot
-- write the canonical ride row directly. All mutations go through reviewed
-- Edge Functions / SECURITY DEFINER RPCs.
revoke insert, update, delete on table public.rides from anon, authenticated;

comment on table public.rides is
  'Canonical APOIS Corridas ride entity. Client roles are read-only; lifecycle, price and payment mutations are server-side only.';
