-- Read-only production readiness checks for the APOIS push subsystem.
-- Additive migration: no business data is changed.

BEGIN;

CREATE OR REPLACE FUNCTION public.push_production_readiness_report()
RETURNS TABLE (
  category text,
  check_name text,
  passed boolean,
  severity text,
  details text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
WITH expected_relations(category, check_name, object_name, severity) AS (
  VALUES
    ('schema','table_notification_tokens','public.user_notification_tokens','critical'),
    ('schema','table_notification_preferences','public.user_notification_preferences','critical'),
    ('schema','table_notification_logs','public.notification_logs','high'),
    ('schema','table_push_outbox','public.push_delivery_outbox','critical'),
    ('schema','table_push_attempts','public.push_delivery_attempts','high'),
    ('schema','table_push_provider_health','public.push_provider_health','high'),
    ('schema','table_notification_inbox','public.user_notification_inbox','critical'),
    ('schema','table_device_receipts','public.push_device_receipts','high'),
    ('schema','table_push_canaries','public.push_canary_devices','medium'),
    ('schema','table_push_diagnostics','public.push_diagnostic_runs','medium'),
    ('schema','table_push_diagnostic_results','public.push_diagnostic_results','medium'),
    ('schema','table_push_campaigns','public.push_campaigns','medium'),
    ('schema','table_push_campaign_recipients','public.push_campaign_recipients','medium'),
    ('schema','table_push_campaign_audit','public.push_campaign_audit','medium'),
    ('schema','view_push_delivery_health','public.push_delivery_health_summary','medium'),
    ('schema','view_notification_inbox_summary','public.notification_inbox_summary','low'),
    ('schema','view_push_canary_health','public.push_canary_health_summary','low'),
    ('schema','view_push_receipt_metrics','public.push_device_receipt_daily_metrics','low')
),
relation_checks AS (
  SELECT category, check_name,
         to_regclass(object_name) IS NOT NULL AS passed,
         severity,
         CASE WHEN to_regclass(object_name) IS NOT NULL THEN 'objeto encontrado' ELSE 'objeto ausente: '||object_name END AS details
  FROM expected_relations
),
expected_functions(category, check_name, signature, severity) AS (
  VALUES
    ('functions','register_notification_token','public.register_my_notification_token(text,text,text,text,text,text,text,text)','critical'),
    ('functions','deactivate_notification_token','public.deactivate_my_notification_token(text,text)','high'),
    ('functions','cleanup_notification_tokens','public.cleanup_notification_tokens(integer,integer)','medium'),
    ('functions','claim_push_batch','public.claim_push_delivery_batch(text,integer)','critical'),
    ('functions','complete_push_delivery','public.complete_push_delivery(uuid,text)','critical'),
    ('functions','fail_push_delivery','public.fail_push_delivery(uuid,text,integer)','critical'),
    ('functions','recover_stale_push','public.recover_stale_push_deliveries(integer)','high'),
    ('functions','can_send_provider','public.can_send_push_provider(text)','high'),
    ('functions','record_provider_success','public.record_push_provider_success(text)','high'),
    ('functions','record_provider_failure','public.record_push_provider_failure(text,text,integer,boolean)','high'),
    ('functions','enqueue_push_event','public.enqueue_push_event(uuid,text,text,jsonb,text,text,smallint,integer)','critical'),
    ('functions','create_inbox_item','public.create_notification_inbox_item(uuid,uuid,text,text,text,text,jsonb,smallint,boolean,timestamptz)','high'),
    ('functions','mark_notification_read','public.mark_my_notification_read(uuid)','medium'),
    ('functions','mark_notification_opened','public.mark_my_notification_opened(uuid)','medium'),
    ('functions','archive_notification','public.archive_my_notification(uuid)','low'),
    ('functions','restore_notification','public.restore_my_notification(uuid)','low'),
    ('functions','mark_all_notifications_read','public.mark_all_my_notifications_read(timestamptz)','low'),
    ('functions','unread_notification_count','public.my_unread_notification_count()','medium'),
    ('functions','list_notifications','public.list_my_notifications(integer,timestamptz,uuid,boolean,boolean)','medium'),
    ('functions','submit_device_receipt','public.submit_push_device_receipt(uuid,uuid,text,text,text,text,text,text,timestamptz,integer,boolean,text,text,text,text,jsonb,text)','high'),
    ('functions','submit_device_receipts_batch','public.submit_push_device_receipts_batch(jsonb)','medium'),
    ('functions','claim_canary_targets','public.claim_push_diagnostic_targets(uuid,integer)','medium'),
    ('functions','complete_diagnostic','public.complete_push_diagnostic(uuid)','medium'),
    ('functions','create_campaign','public.create_push_campaign(text,text,text,text,text,jsonb,text,text,text,smallint,boolean,timestamptz)','medium'),
    ('functions','submit_campaign_approval','public.submit_push_campaign_for_approval(uuid)','medium'),
    ('functions','approve_campaign','public.approve_push_campaign(uuid,integer)','high'),
    ('functions','pause_campaign','public.pause_push_campaign(uuid,text)','medium'),
    ('functions','resume_campaign','public.resume_push_campaign(uuid)','medium'),
    ('functions','abort_campaign','public.abort_push_campaign(uuid,text)','high'),
    ('functions','expire_campaign_approvals','public.expire_push_campaign_approvals(integer)','medium')
),
function_checks AS (
  SELECT category, check_name,
         to_regprocedure(signature) IS NOT NULL AS passed,
         severity,
         CASE WHEN to_regprocedure(signature) IS NOT NULL THEN 'função encontrada' ELSE 'função ausente ou assinatura divergente: '||signature END AS details
  FROM expected_functions
),
expected_indexes(category, check_name, index_name, severity) AS (
  VALUES
    ('indexes','idx_tokens_active_user_device','ux_notification_tokens_active_user_device_platform','high'),
    ('indexes','idx_tokens_active_last_success','ix_notification_tokens_active_last_success','medium'),
    ('indexes','idx_outbox_pending','ix_push_outbox_pending','critical'),
    ('indexes','idx_outbox_locked','ix_push_outbox_locked','high'),
    ('indexes','idx_attempts_outbox','ix_push_delivery_attempts_outbox','medium'),
    ('indexes','idx_provider_state','ix_push_provider_health_state','medium'),
    ('indexes','idx_inbox_user_created','ix_notification_inbox_user_created','high'),
    ('indexes','idx_inbox_unread','ix_notification_inbox_user_unread','high'),
    ('indexes','idx_inbox_outbox_unique','ux_notification_inbox_user_outbox','high'),
    ('indexes','idx_receipts_event_unique','ux_push_device_receipts_event_id','high'),
    ('indexes','idx_receipts_notification_type','ix_push_device_receipts_notification_type','medium'),
    ('indexes','idx_canary_active_unique','ux_push_canary_active_device_environment','medium'),
    ('indexes','idx_diagnostic_key_unique','ux_push_diagnostic_runs_key','medium'),
    ('indexes','idx_campaign_status_schedule','ix_push_campaigns_status_schedule','medium'),
    ('indexes','idx_campaign_recipient_unique','ux_push_campaign_recipients_campaign_user','high'),
    ('indexes','idx_campaign_audit_request','ix_push_campaign_audit_request','low')
),
index_checks AS (
  SELECT category, check_name,
         EXISTS (
           SELECT 1 FROM pg_indexes
           WHERE schemaname='public' AND indexname=index_name
         ) AS passed,
         severity,
         CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname=index_name)
              THEN 'índice encontrado' ELSE 'índice ausente: '||index_name END AS details
  FROM expected_indexes
),
rls_targets(category, check_name, table_name, severity) AS (
  VALUES
    ('security','rls_notification_tokens','user_notification_tokens','critical'),
    ('security','rls_notification_preferences','user_notification_preferences','critical'),
    ('security','rls_push_outbox','push_delivery_outbox','critical'),
    ('security','rls_push_attempts','push_delivery_attempts','high'),
    ('security','rls_provider_health','push_provider_health','high'),
    ('security','rls_notification_inbox','user_notification_inbox','critical'),
    ('security','rls_device_receipts','push_device_receipts','high'),
    ('security','rls_canary_devices','push_canary_devices','medium'),
    ('security','rls_diagnostic_runs','push_diagnostic_runs','medium'),
    ('security','rls_diagnostic_results','push_diagnostic_results','medium'),
    ('security','rls_campaigns','push_campaigns','medium'),
    ('security','rls_campaign_recipients','push_campaign_recipients','medium'),
    ('security','rls_campaign_audit','push_campaign_audit','medium')
),
rls_checks AS (
  SELECT category, check_name,
         COALESCE(c.relrowsecurity,false) AS passed,
         severity,
         CASE WHEN COALESCE(c.relrowsecurity,false) THEN 'RLS habilitada' ELSE 'RLS ausente ou tabela não encontrada: '||table_name END AS details
  FROM rls_targets t
  LEFT JOIN pg_class c ON c.relname=t.table_name
  LEFT JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
),
policy_checks AS (
  SELECT 'security'::text AS category,
         x.check_name,
         EXISTS (
           SELECT 1 FROM pg_policies p
           WHERE p.schemaname='public' AND p.tablename=x.table_name AND p.policyname=x.policy_name
         ) AS passed,
         x.severity,
         CASE WHEN EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=x.table_name AND p.policyname=x.policy_name)
              THEN 'política encontrada' ELSE 'política ausente: '||x.policy_name END AS details
  FROM (VALUES
    ('policy_tokens_select_own','user_notification_tokens','notification_tokens_select_own','high'),
    ('policy_preferences_select_own','user_notification_preferences','notification_preferences_select_own','high'),
    ('policy_inbox_select_own','user_notification_inbox','notification_inbox_select_own','critical'),
    ('policy_receipts_select_own','push_device_receipts','push_device_receipts_select_own','medium')
  ) AS x(check_name,table_name,policy_name,severity)
),
operational_checks AS (
  SELECT 'operations'::text,'provider_row_fcm'::text,
         EXISTS (SELECT 1 FROM public.push_provider_health WHERE provider='fcm'),
         'high'::text,
         CASE WHEN EXISTS (SELECT 1 FROM public.push_provider_health WHERE provider='fcm') THEN 'configuração FCM encontrada' ELSE 'configuração FCM ainda não inicializada' END
  UNION ALL
  SELECT 'operations','provider_not_open',
         COALESCE((SELECT state<>'open' FROM public.push_provider_health WHERE provider='fcm'),false),
         'high',
         COALESCE((SELECT 'estado atual: '||state FROM public.push_provider_health WHERE provider='fcm'),'estado indisponível')
  UNION ALL
  SELECT 'operations','outbox_without_stale_locks',
         NOT EXISTS (SELECT 1 FROM public.push_delivery_outbox WHERE status='processing' AND locked_at<now()-interval '15 minutes'),
         'high','verifica locks de processamento superiores a 15 minutos'
  UNION ALL
  SELECT 'operations','outbox_without_expired_pending',
         NOT EXISTS (SELECT 1 FROM public.push_delivery_outbox WHERE status='pending' AND expires_at IS NOT NULL AND expires_at<now()),
         'medium','verifica notificações pendentes já expiradas'
  UNION ALL
  SELECT 'operations','outbox_without_attempt_overflow',
         NOT EXISTS (SELECT 1 FROM public.push_delivery_outbox WHERE attempt_count>max_attempts),
         'critical','verifica contador de tentativas acima do limite'
  UNION ALL
  SELECT 'operations','active_tokens_have_permission',
         NOT EXISTS (SELECT 1 FROM public.user_notification_tokens WHERE is_active=true AND permission_status IS DISTINCT FROM 'granted'),
         'high','tokens ativos devem possuir permissão concedida'
  UNION ALL
  SELECT 'operations','active_tokens_not_invalidated',
         NOT EXISTS (SELECT 1 FROM public.user_notification_tokens WHERE is_active=true AND invalidated_at IS NOT NULL),
         'critical','tokens ativos não podem estar invalidados'
  UNION ALL
  SELECT 'operations','inbox_delivery_consistency',
         NOT EXISTS (SELECT 1 FROM public.user_notification_inbox WHERE delivery_status='sent' AND delivered_at IS NULL),
         'high','itens enviados devem registrar delivered_at'
  UNION ALL
  SELECT 'operations','campaign_counts_consistent',
         NOT EXISTS (SELECT 1 FROM public.push_campaigns WHERE queued_count+failed_count+skipped_count>recipient_count),
         'high','contadores da campanha não podem superar destinatários'
  UNION ALL
  SELECT 'operations','campaign_no_expired_approval_active',
         NOT EXISTS (SELECT 1 FROM public.push_campaigns WHERE status IN ('approved','launching','running','paused') AND approval_expires_at IS NOT NULL AND approval_expires_at<now()),
         'high','campanhas ativas não devem ter aprovação expirada'
)
SELECT * FROM relation_checks
UNION ALL SELECT * FROM function_checks
UNION ALL SELECT * FROM index_checks
UNION ALL SELECT * FROM rls_checks
UNION ALL SELECT * FROM policy_checks
UNION ALL SELECT * FROM operational_checks;
$$;

CREATE OR REPLACE VIEW public.push_production_readiness_summary
WITH (security_invoker = true)
AS
SELECT
  count(*) AS total_checks,
  count(*) FILTER (WHERE passed) AS passed_checks,
  count(*) FILTER (WHERE NOT passed) AS failed_checks,
  count(*) FILTER (WHERE NOT passed AND severity='critical') AS critical_failures,
  count(*) FILTER (WHERE NOT passed AND severity='high') AS high_failures,
  round(100.0 * count(*) FILTER (WHERE passed) / NULLIF(count(*),0),2) AS readiness_percent
FROM public.push_production_readiness_report();

REVOKE ALL ON FUNCTION public.push_production_readiness_report() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_production_readiness_report() TO service_role;
REVOKE ALL ON public.push_production_readiness_summary FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.push_production_readiness_summary TO service_role;

COMMIT;
