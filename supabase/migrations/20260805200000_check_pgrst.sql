-- Tentar listar triggers de auth.users usando caminhos alternativos ou permissões de service_role se o migration permitir
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT trg.tgname AS trigger_name,
               rel.relname AS table_name
        FROM pg_trigger trg
        JOIN pg_class rel ON trg.tgrelid = rel.oid
        JOIN pg_namespace nsp ON rel.relnamespace = nsp.oid
        WHERE nsp.nspname = 'auth' AND rel.relname = 'users'
    ) LOOP
        RAISE NOTICE 'Trigger Low-Level em auth.users: %', r.trigger_name;
    END LOOP;
END $$;
