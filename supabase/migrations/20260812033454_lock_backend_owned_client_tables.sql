-- These tables expose only SELECT policies to authenticated clients. Their
-- mutations are backend-owned (Edge Functions/RPCs), so table-level DML grants
-- are unnecessary and increase blast radius if a future policy is misconfigured.
revoke insert, update, delete
  on table public.account_deletion_requests,
           public.driver_asaas_accounts,
           public.driver_memberships,
           public.driver_membership_charges,
           public.driver_withdrawals,
           public.notification_logs,
           public.passenger_support_tickets,
           public.payment_methods
  from anon, authenticated;
