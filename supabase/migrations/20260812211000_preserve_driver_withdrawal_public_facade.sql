-- APOIS Corridas — keep the Motorista RPC contract stable across provider cutover.

create or replace function public.driver_request_withdrawal(
  _amount_cents bigint,
  _idempotency_key uuid
)
returns jsonb
language sql
set search_path = ''
as $$
  select apois_rpc_private.driver_request_withdrawal($1,$2);
$$;

revoke all on function public.driver_request_withdrawal(bigint,uuid) from public,anon;
grant execute on function public.driver_request_withdrawal(bigint,uuid) to authenticated,service_role;

comment on function public.driver_request_withdrawal(bigint,uuid) is
  'Stable Motorista payout facade. Provider execution remains server-side through request-driver-payout.';
