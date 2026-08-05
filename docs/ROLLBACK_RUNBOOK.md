# ROLLBACK RUNBOOK - APOIS BACKEND MIGRATION

## 1. PRE-DEPLOYMENT BACKUP
Before any migration to the target project (vqtucstyduxrqjgyigfk), perform a full database backup via the Supabase Dashboard/CLI.
Ensure all current Edge Function code is committed to Git.

## 2. DATABASE MIGRATION ROLLBACK
If `20260806000000_clean_baseline.sql` fails:
1. Inspect the error log in the Supabase Dashboard.
2. If the schema is in an inconsistent state, use `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` (WARNING: This deletes all data in the target project).
3. Restore from the pre-deployment backup.

## 3. AUTH TRIGGER ROLLBACK
If the `on_auth_user_created` trigger causes registration failures:
1. Run: `DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;`
2. Run: `DROP FUNCTION IF EXISTS public.handle_new_user();`
3. Check `auth.users` for orphaned records.

## 4. EDGE FUNCTION ROLLBACK
If a newly deployed Edge Function (e.g., `request-ride`) fails in production:
1. Re-deploy the previous known-good version from the Git history.
2. If it's a new function, delete it using the Supabase CLI: `supabase functions delete <slug>`.

## 5. FRONTEND ROLLBACK
If the staging cutover fails:
1. Revert environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) to point back to the Lovable Cloud project (`zjphbuvcapwyuynadgdt`).
2. Re-publish the application.

## 6. SOURCE PROTECTION CONFIRMATION
The Lovable Cloud source backend (`zjphbuvcapwyuynadgdt`) remains UNTOUCHED throughout this process. It serves as the ultimate fallback. No commands should be executed against the source project during target staging.
