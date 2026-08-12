-- APOIS Corridas — keep payout provider activation operationally controlled.
-- The Woovi payout schema must not silently enable a provider during migration.
-- Provider selection remains a deliberate production/homologation action.

-- Do not enable payouts here.
-- Only restore the provider switch when the migration chain previously changed it
-- automatically. The actual activation must be performed separately after E2E.

update public.app_settings
set value = to_jsonb('asaas'::text)
where key = 'finance.target_payout_provider'
  and exists (
    select 1
    from public.app_settings
    where key = 'finance.driver_payouts_enabled'
      and coalesce(value #>> '{}','false') <> 'true'
  );

comment on table public.app_settings is
  'Financial provider switches require explicit operational activation and must not be enabled implicitly by schema migrations.';
