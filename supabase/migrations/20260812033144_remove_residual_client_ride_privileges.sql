-- RLS does not protect TRUNCATE and client roles do not need schema-level
-- REFERENCES/TRIGGER privileges on the canonical ride table. Keep clients
-- strictly read-only at the SQL privilege layer.
revoke truncate, references, trigger on table public.rides from anon, authenticated;
