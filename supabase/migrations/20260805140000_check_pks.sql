-- Tentar descobrir PK de users
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS data_type
        FROM   pg_index i
        JOIN   pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE  i.indrelid = 'public.users'::regclass AND i.indisprimary
    ) LOOP
        RAISE NOTICE 'PK de users: % (%)', r.attname, r.data_type;
    END LOOP;
END $$;
