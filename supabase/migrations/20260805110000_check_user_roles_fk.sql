-- Tentar listar triggers de auth.users usando caminhos alternativos ou permissões de service_role se o migration permitir
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT 
            tc.table_name, kcu.column_name, 
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name 
        FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'user_roles'
    ) LOOP
        RAISE NOTICE 'FK em %: % -> %.%', r.table_name, r.column_name, r.foreign_table_name, r.foreign_column_name;
    END LOOP;
END $$;
