# Deployment & Rollback Runbook - APOIS

## Deployment Procedure (ORDERED)

1. **Inspection**: Verify Target Project state via `supabase db lint`.
2. **Backup**: Perform a full database backup of the target (if data exists).
3. **Extensions**: Apply `extensions.sql` (UUID, etc.).
4. **Schema**: Apply the `20260806000000_clean_baseline.sql` migration.
5. **RBAC**: Apply user roles and helper functions.
6. **Trigger**: Deploy the `handle_new_user` Auth trigger.
7. **Triggers**: Deploy `updated_at` automated triggers.
8. **Security**: Enable RLS on all 10 tables.
9. **Policies**: Apply the RLS Policy Matrix SQL.
10. **Seed**: Run `20260806001000_seed_reference_data.sql`.
11. **Secrets**: Set project secrets via CLI: `supabase secrets set --env-file .env`.
12. **Edge Functions**: Deploy all 15 functions via `supabase functions deploy`.
13. **Auth**: Configure Social Auth (Google) and Email settings.
14. **Validation**: Run smoke tests on staging frontend.

## Rollback Procedure

### Database Failure
- **SQL Error**: Migration tool auto-rolls back the transaction. Inspect logs.
- **Corrupted State**: Restore database backup using `supabase db restore`.

### Edge Function Failure
- **Deploy Error**: Re-deploy the previous known-good version from Git history.
- **Runtime Error**: Revert `SUPABASE_URL` in frontend to point back to Project A.

### Frontend Failure
- **Env Variable Error**: Revert Vercel/Hosting environment variables to previous values and redeploy.

### Data Safety
- **DO NOT** use `DROP SCHEMA public CASCADE` on production.
- Use point-in-time recovery if available on the target project.
