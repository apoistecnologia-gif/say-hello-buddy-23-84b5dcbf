-- Cleanup first
DELETE FROM auth.users WHERE email LIKE 'test_%@example.com';
