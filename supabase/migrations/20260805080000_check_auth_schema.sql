-- Tentar listar triggers de auth.users usando caminhos alternativos ou permissões de service_role se o migration permitir
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT trigger_name FROM information_schema.triggers WHERE event_object_schema = 'auth' AND event_object_table = 'users') LOOP
        RAISE NOTICE 'Trigger encontrada: %', r.trigger_name;
    END LOOP;
END $$;
