-- Tentar remover QUALQUER trigger em auth.users, mesmo as que não sabemos o nome.
DO $$
DECLARE
    tr RECORD;
BEGIN
    FOR tr IN (SELECT trigger_name, event_object_table 
               FROM information_schema.triggers 
               WHERE event_object_schema = 'auth' AND event_object_table = 'users') LOOP
        EXECUTE 'DROP TRIGGER ' || tr.trigger_name || ' ON auth.users';
    END LOOP;
END $$;
