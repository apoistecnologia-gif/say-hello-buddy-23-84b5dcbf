-- Inspecionar as colunas reais da tabela users
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'users'
    ) LOOP
        RAISE NOTICE 'Coluna em users: % (%)', r.column_name, r.data_type;
    END LOOP;
END $$;
