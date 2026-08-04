-- Índices para queries quentes que ainda não têm cobertura.

-- subscriptions: sync_driver_subscription_from_subscriptions faz ORDER BY created_at DESC WHERE driver_id=?
CREATE INDEX IF NOT EXISTS idx_subscriptions_driver_created
  ON public.subscriptions (driver_id, created_at DESC);

-- subscriptions: admin_analytics_financial / subscription_growth filtram WHERE paid_at >= ?
CREATE INDEX IF NOT EXISTS idx_subscriptions_paid_at
  ON public.subscriptions (paid_at)
  WHERE paid_at IS NOT NULL;

-- rides: get_driver_home_kpis filtra por driver_id + completed_at (status='finalizada')
CREATE INDEX IF NOT EXISTS idx_rides_driver_completed_at
  ON public.rides (driver_id, completed_at DESC)
  WHERE status = 'finalizada';

-- driver_wallet_transactions: settle_cancellation_fee busca por source_ride_id + status
CREATE INDEX IF NOT EXISTS idx_dwt_source_ride
  ON public.driver_wallet_transactions (source_ride_id)
  WHERE source_ride_id IS NOT NULL;

-- ride_ratings: sync_ride_rating usa ON CONFLICT (ride_id) — já é UNIQUE, ok.
-- rides.status / driver_id / passenger_id / created_at / accepted_driver_id / candidates — todos indexados.
-- drivers.approval_status / is_online / category / location — todos indexados.
-- notification_inbox / notification_logs por (user_id, created_at) — indexados.
-- cancellation_fees por driver_id/passenger_id — indexados.

ANALYZE public.subscriptions;
ANALYZE public.rides;
ANALYZE public.driver_wallet_transactions;
