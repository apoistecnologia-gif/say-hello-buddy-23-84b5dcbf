-- Financial and authorization tables are read-only to authenticated clients.
-- All writes are owned by backend functions/RPCs. Drivers retain UPDATE because
-- a separate admin-only RLS policy currently authorizes reviewed admin updates.
revoke insert, update, delete, truncate, references, trigger
  on table public.ride_pix_payments,
           public.driver_wallets,
           public.driver_wallet_transactions,
           public.passenger_wallets,
           public.cancellation_fees,
           public.user_roles
  from anon, authenticated;

revoke insert, delete, truncate, references, trigger
  on table public.drivers
  from anon, authenticated;
