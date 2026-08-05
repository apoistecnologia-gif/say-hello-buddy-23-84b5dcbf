-- Tentar ver quais tabelas realmente existem no public
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT table_name FROM information_schema.tables WHERE table_schema = 'public') LOOP
        RAISE NOTICE 'Tabela encontrada: %', r.table_name;
    END LOOP;
END $$;
