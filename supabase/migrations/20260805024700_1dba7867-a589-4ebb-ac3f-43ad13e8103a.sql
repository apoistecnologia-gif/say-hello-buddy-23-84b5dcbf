-- Clean up potentially broken test users from this session
DELETE FROM auth.users WHERE email LIKE 'test_%@example.com';
