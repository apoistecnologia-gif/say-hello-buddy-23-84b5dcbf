-- APOIS Corridas — make Admin finance provider reporting reflect the actual
-- configured cutover switches. This migration does not change either switch.

create or replace function apois_rpc_private.admin_get_finance_summary(
  _from timestamptz,
  _to timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_from timestamptz := coalesce(_from,date_trunc('month',now()));
  v_to timestamptz := coalesce(_to,now());
  v_result jsonb;
  v_electronic_provider text := null;
  v_payout_provider text := null;
begin
  if v_actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if not private.has_permission('finance.read') then raise exception 'forbidden' using errcode='42501'; end if;
  if v_from>v_to then raise exception 'invalid_range' using errcode='22023'; end if;

  select nullif(lower(btrim(value #>> '{}')),'') into v_electronic_provider
  from public.app_settings
  where key='finance.target_electronic_payment_provider';

  select nullif(lower(btrim(value #>> '{}')),'') into v_payout_provider
  from public.app_settings
  where key='finance.target_payout_provider';

  with filtered_settlements as (
    select *
    from public.ride_settlements
    where created_at between v_from and v_to
  ),
  filtered_withdrawals as (
    select *
    from public.driver_withdrawals
    where requested_at between v_from and v_to
  ),
  settlement_totals as (
    select
      coalesce(sum(passenger_charge) filter(where status='settled'),0) as gmv,
      coalesce(sum(driver_earning) filter(where status='settled'),0) as driver_earnings,
      coalesce(sum(platform_fee) filter(where status='settled'),0) as platform_revenue,
      coalesce(sum(payment_provider_fee) filter(where status='settled'),0) as provider_fees,
      coalesce(sum(refunded_amount),0) as refunds,
      count(*) filter(where status='settled') as settled_count,
      count(*) filter(where status in ('pending','awaiting_payment','processing')) as pending_count,
      count(*) filter(where status in ('failed','payment_failed')) as failed_count
    from filtered_settlements
  ),
  withdrawal_totals as (
    select
      coalesce(sum(amount) filter(where status in ('pending','requested','processing')),0) as pending_amount,
      coalesce(sum(amount) filter(where status in ('paid','completed')),0) as paid_amount
    from filtered_withdrawals
  ),
  recent_settlements as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',ride_id,
      'ride_id',ride_id,
      'driver_id',driver_id,
      'passenger_id',passenger_id,
      'payment_method',payment_method,
      'payment_status',payment_status,
      'payment_provider',payment_provider,
      'status',status,
      'passenger_charge_cents',round(coalesce(passenger_charge,0)*100)::bigint,
      'driver_earning_cents',round(coalesce(driver_earning,0)*100)::bigint,
      'platform_fee_cents',round(coalesce(platform_fee,0)*100)::bigint,
      'payment_provider_fee_cents',round(coalesce(payment_provider_fee,0)*100)::bigint,
      'refunded_amount_cents',round(coalesce(refunded_amount,0)*100)::bigint,
      'created_at',created_at,
      'settled_at',settled_at
    ) order by created_at desc),'[]'::jsonb) as rows
    from (
      select * from filtered_settlements order by created_at desc limit 50
    ) s
  ),
  recent_withdrawals as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',id,
      'driver_id',driver_id,
      'amount_cents',round(coalesce(amount,0)*100)::bigint,
      'status',status,
      'provider',provider,
      'provider_transfer_id',provider_transfer_id,
      'failure_reason',failure_reason,
      'requested_at',requested_at,
      'processed_at',processed_at
    ) order by requested_at desc),'[]'::jsonb) as rows
    from (
      select * from filtered_withdrawals order by requested_at desc limit 50
    ) w
  )
  select jsonb_build_object(
    'from',v_from,
    'to',v_to,
    'settlements',jsonb_build_object(
      'gmv_cents',round(st.gmv*100)::bigint,
      'driver_earnings_cents',round(st.driver_earnings*100)::bigint,
      'platform_revenue_cents',round(st.platform_revenue*100)::bigint,
      'provider_fees_cents',round(st.provider_fees*100)::bigint,
      'refunds_cents',round(st.refunds*100)::bigint,
      'settled_count',st.settled_count,
      'pending_count',st.pending_count,
      'failed_count',st.failed_count
    ),
    'withdrawals',jsonb_build_object(
      'pending_cents',round(wt.pending_amount*100)::bigint,
      'paid_cents',round(wt.paid_amount*100)::bigint
    ),
    'providers',jsonb_build_object(
      'electronic_payment_provider',v_electronic_provider,
      'payout_provider',v_payout_provider
    ),
    'recent_settlements',rs.rows,
    'recent_withdrawals',rw.rows
  ) into v_result
  from settlement_totals st
  cross join withdrawal_totals wt
  cross join recent_settlements rs
  cross join recent_withdrawals rw;

  return v_result;
end;
$$;

revoke all on function apois_rpc_private.admin_get_finance_summary(timestamptz,timestamptz) from public,anon;
grant execute on function apois_rpc_private.admin_get_finance_summary(timestamptz,timestamptz) to authenticated,service_role;

create or replace function public.admin_get_finance_summary(
  _from timestamptz,
  _to timestamptz
)
returns jsonb
language sql
set search_path = ''
as $$
  select apois_rpc_private.admin_get_finance_summary($1,$2);
$$;

revoke all on function public.admin_get_finance_summary(timestamptz,timestamptz) from public,anon;
grant execute on function public.admin_get_finance_summary(timestamptz,timestamptz) to authenticated,service_role;

comment on function apois_rpc_private.admin_get_finance_summary(timestamptz,timestamptz) is
  'Canonical Admin financial summary exposing configured electronic-payment and payout providers without changing provider switches.';
