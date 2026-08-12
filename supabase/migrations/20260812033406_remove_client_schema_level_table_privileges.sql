-- Browser/mobile roles never need schema-level TRUNCATE, TRIGGER or REFERENCES
-- privileges. RLS does not protect TRUNCATE, so retaining it on any public table
-- violates deny-by-default even when row policies are correct.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
