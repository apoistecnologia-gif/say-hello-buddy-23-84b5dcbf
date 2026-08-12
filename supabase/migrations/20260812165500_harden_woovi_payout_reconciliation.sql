-- APOIS Corridas — payout reconciliation hardening.
-- A Woovi movement correlation id must identify at most one driver withdrawal.
-- Historical non-Woovi rows are intentionally outside this partial index.

create unique index if not exists driver_withdrawals_woovi_transfer_uidx
  on public.driver_withdrawals(provider_transfer_id)
  where provider = 'woovi' and provider_transfer_id is not null;

comment on index public.driver_withdrawals_woovi_transfer_uidx is
  'Prevents one Woovi movement correlation id from being bound to multiple driver withdrawals.';
