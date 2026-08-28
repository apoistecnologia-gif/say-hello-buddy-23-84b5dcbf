BEGIN;

-- Passenger active-ride screens depend on postgres_changes for public.rides.
-- Keep this migration idempotent so production and restored environments stay aligned.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'rides'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rides;
  END IF;
END
$$;

COMMIT;
