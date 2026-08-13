-- APOIS Corridas — provider-aware driver financial dashboard.
-- Keeps the public RPC contract stable while removing the Asaas-only gate and
-- exposing the canonical pending_balance created for provider-backed payouts.

create or replace function apois_rpc_private.get_driver_financial_dashboard(
  _from timestamptz,
  _to timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_driver_id uuid;
  v_from timestamptz;
  v_to timestamptz;
  v_wallet public.driver_wallets%rowtype;
  v_period_earnings bigint := 0;
  v_period_rides integer := 0;
  v_today bigint := 0;
  v_last_7 bigint := 0;
  v_month bigint := 0;
  v_settlements jsonb := '[]'::jsonb;
  v_withdrawals jsonb := '[]'::jsonb;
  v_payout_enabled boolean := false;
  v_provider text := 'disabled';
  v_reason text := null;
  v_min_withdrawal_cents bigint := 2000;
  v_destination public.driver_payout_destinations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'unauthorized' using errcode='42501';
  end if;

  select d.id into v_driver_id
  from public.drivers d
  where d.user_id=public.mobility_user_id()
  limit 1;
  if v_driver_id is null then
    raise exception 'driver_profile_missing' using errcode='42501';
  end if;

  v_from := coalesce(_from,date_trunc('day',now())-interval '6 days');
  v_to := coalesce(_to,now());
  if v_from > v_to then raise exception 'invalid_financial_period' using errcode='22023'; end if;
  if v_to-v_from > interval '366 days' then raise exception 'financial_period_too_large' using errcode='22023'; end if;

  select * into v_wallet
  from public.driver_wallets w
  where w.driver_id=v_driver_id
  limit 1;
  if not found then
    v_wallet.driver_id := v_driver_id;
    v_wallet.balance := 0;
    v_wallet.available_balance := 0;
    v_wallet.pending_balance := 0;
    v_wallet.updated_at := now();
  end if;

  select coalesce(round(sum(t.amount)*100)::bigint,0),count(*)::integer
    into v_period_earnings,v_period_rides
  from public.driver_wallet_transactions t
  where t.driver_id=v_driver_id and t.direction='credit' and t.source='ride'
    and t.created_at>=v_from and t.created_at<=v_to;

  select coalesce(round(sum(t.amount)*100)::bigint,0) into v_today
  from public.driver_wallet_transactions t
  where t.driver_id=v_driver_id and t.direction='credit' and t.source='ride'
    and t.created_at>=date_trunc('day',now())
    and t.created_at<date_trunc('day',now())+interval '1 day';

  select coalesce(round(sum(t.amount)*100)::bigint,0) into v_last_7
  from public.driver_wallet_transactions t
  where t.driver_id=v_driver_id and t.direction='credit' and t.source='ride'
    and t.created_at>=date_trunc('day',now())-interval '6 days'
    and t.created_at<date_trunc('day',now())+interval '1 day';

  select coalesce(round(sum(t.amount)*100)::bigint,0) into v_month
  from public.driver_wallet_transactions t
  where t.driver_id=v_driver_id and t.direction='credit' and t.source='ride'
    and t.created_at>=date_trunc('month',now())
    and t.created_at<date_trunc('month',now())+interval '1 month';

  select coalesce(jsonb_agg(item order by item->>'created_at' desc),'[]'::jsonb) into v_settlements
  from (
    select jsonb_build_object(
      'settlement_id',rs.ride_id,
      'ride_id',rs.ride_id,
      'origin_name',r.origin_name,
      'destination_name',r.destination_name,
      'category',r.category,
      'distance_km',r.distance_km,
      'duration_min',r.duration_min,
      'payment_method',rs.payment_method,
      'payment_status',rs.payment_status,
      'settlement_status',rs.status,
      'driver_earning_cents',round(t.amount*100)::bigint,
      'platform_fee_cents',coalesce(round(rs.platform_fee*100)::bigint,0),
      'payment_provider',rs.payment_provider,
      'payment_provider_fee_cents',coalesce(round(rs.payment_provider_fee*100)::bigint,0),
      'created_at',t.created_at,
      'settled_at',rs.settled_at
    ) as item
    from public.driver_wallet_transactions t
    join public.ride_settlements rs on rs.ride_id=t.source_id and rs.driver_id=t.driver_id
    join public.rides r on r.id=rs.ride_id
    where t.driver_id=v_driver_id and t.direction='credit' and t.source='ride'
      and t.created_at>=v_from and t.created_at<=v_to
    order by t.created_at desc
    limit 100
  ) q;

  select coalesce(jsonb_agg(item order by item->>'requested_at' desc),'[]'::jsonb) into v_withdrawals
  from (
    select jsonb_build_object(
      'id',w.id,
      'amount_cents',round(w.amount*100)::bigint,
      'status',w.status,
      'provider',w.provider,
      'failure_reason',w.failure_reason,
      'requested_at',w.requested_at,
      'processed_at',w.processed_at
    ) as item
    from public.driver_withdrawals w
    where w.driver_id=v_driver_id
    order by w.requested_at desc
    limit 50
  ) q;

  select coalesce((value #>> '{}')::boolean,false) into v_payout_enabled
  from public.app_settings where key='finance.driver_payouts_enabled';

  select lower(coalesce(value #>> '{}','disabled')) into v_provider
  from public.app_settings where key='finance.target_payout_provider';
  v_provider := coalesce(v_provider,'disabled');

  select coalesce((value #>> '{}')::bigint,2000) into v_min_withdrawal_cents
  from public.app_settings where key='finance.driver_min_withdrawal_cents';

  select * into v_destination
  from public.driver_payout_destinations
  where driver_id=v_driver_id;

  if not coalesce(v_payout_enabled,false) then
    v_reason := 'homologation_disabled';
  elsif v_destination.driver_id is null or v_destination.confirmed_at is null then
    v_payout_enabled := false;
    v_reason := 'pix_payout_destination_not_confirmed';
  elsif v_destination.payout_available_at is not null and v_destination.payout_available_at>now() then
    v_payout_enabled := false;
    v_reason := 'pix_payout_destination_cooldown';
  elsif v_provider='woovi' then
    if not exists(
      select 1
      from public.driver_payment_accounts a
      where a.driver_id=v_driver_id
        and a.provider='woovi'
        and a.status='active'
        and a.pix_key=v_destination.pix_key
        and nullif(btrim(a.provider_subaccount_id),'') is not null
    ) then
      v_payout_enabled := false;
      v_reason := 'woovi_subaccount_not_active';
    else
      v_reason := null;
    end if;
  elsif v_provider='asaas' then
    if not exists(
      select 1
      from public.driver_asaas_accounts a
      where a.driver_id=v_driver_id
        and a.status='approved'
        and nullif(a.subaccount_id,'') is not null
        and nullif(a.wallet_id,'') is not null
    ) then
      v_payout_enabled := false;
      v_reason := 'asaas_subaccount_not_approved';
    elsif not exists(
      select 1 from public.asaas_subaccount_credentials c where c.driver_id=v_driver_id
    ) then
      v_payout_enabled := false;
      v_reason := 'asaas_subaccount_secret_missing';
    else
      v_reason := null;
    end if;
  else
    v_payout_enabled := false;
    v_reason := 'payout_provider_not_supported';
  end if;

  return jsonb_build_object(
    'ok',true,
    'driver_id',v_driver_id,
    'period',jsonb_build_object(
      'from',v_from,
      'to',v_to,
      'settled_earnings_cents',v_period_earnings,
      'settled_rides',v_period_rides
    ),
    'kpis',jsonb_build_object(
      'today_cents',v_today,
      'last_7_days_cents',v_last_7,
      'month_cents',v_month
    ),
    'wallet',jsonb_build_object(
      'balance_cents',round(coalesce(v_wallet.balance,0)*100)::bigint,
      'available_balance_cents',round(coalesce(v_wallet.available_balance,0)*100)::bigint,
      'pending_balance_cents',round(coalesce(v_wallet.pending_balance,0)*100)::bigint,
      'debt_balance_cents',0,
      'updated_at',coalesce(v_wallet.updated_at,now())
    ),
    'payout',jsonb_build_object(
      'enabled',v_payout_enabled,
      'provider',case when v_provider='disabled' then null else v_provider end,
      'reason',v_reason,
      'min_withdrawal_cents',v_min_withdrawal_cents,
      'destination_confirmed',v_destination.confirmed_at is not null,
      'payout_available_at',v_destination.payout_available_at
    ),
    'settlements',v_settlements,
    'withdrawals',v_withdrawals
  );
end;
$$;

revoke all on function apois_rpc_private.get_driver_financial_dashboard(timestamptz,timestamptz) from public,anon;
grant execute on function apois_rpc_private.get_driver_financial_dashboard(timestamptz,timestamptz) to authenticated,service_role;

-- Keep the existing public facade stable for the Motorista app.
create or replace function public.get_driver_financial_dashboard(
  _from timestamptz,
  _to timestamptz
)
returns jsonb
language sql
set search_path = ''
as $$
  select apois_rpc_private.get_driver_financial_dashboard($1,$2);
$$;

revoke all on function public.get_driver_financial_dashboard(timestamptz,timestamptz) from public,anon;
grant execute on function public.get_driver_financial_dashboard(timestamptz,timestamptz) to authenticated,service_role;

comment on function apois_rpc_private.get_driver_financial_dashboard(timestamptz,timestamptz) is
  'Provider-aware Motorista financial dashboard backed by canonical settlements, wallet ledger, pending balance and payout destination.';
