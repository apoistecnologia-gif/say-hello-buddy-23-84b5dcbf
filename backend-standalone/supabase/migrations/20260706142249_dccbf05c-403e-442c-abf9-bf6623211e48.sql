
-- Fix: subscriptions.driver_id references auth.users(id) (per FK and RLS),
-- but the sync triggers matched drivers.id, so they silently did nothing.
-- Rewriting them to join by drivers.user_id makes the drivers table reflect
-- the latest subscription state (financial_status / subscription_status /
-- next_due_date), which powers the driver's assinatura page and admin views.

CREATE OR REPLACE FUNCTION public.sync_driver_financial_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_latest_id uuid;
BEGIN
  SELECT id INTO v_latest_id
    FROM public.subscriptions
   WHERE driver_id = NEW.driver_id
   ORDER BY created_at DESC LIMIT 1;
  IF v_latest_id IS NULL OR v_latest_id <> NEW.id THEN RETURN NEW; END IF;

  UPDATE public.drivers d
     SET financial_status = CASE NEW.status
           WHEN 'active'    THEN 'active'::driver_financial_status
           WHEN 'pending'   THEN 'pending'::driver_financial_status
           WHEN 'overdue'   THEN 'overdue'::driver_financial_status
           WHEN 'expired'   THEN 'overdue'::driver_financial_status
           WHEN 'cancelled' THEN 'cancelled'::driver_financial_status
           WHEN 'blocked'   THEN 'overdue'::driver_financial_status
           ELSE d.financial_status END,
         next_due_date = COALESCE(NEW.period_end::date, d.next_due_date),
         updated_at = now()
   WHERE d.user_id = NEW.driver_id;

  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.sync_driver_subscription_from_subscriptions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_latest_id uuid;
BEGIN
  SELECT id INTO v_latest_id
    FROM public.subscriptions
   WHERE driver_id = NEW.driver_id
   ORDER BY created_at DESC LIMIT 1;

  IF v_latest_id IS NULL OR v_latest_id <> NEW.id THEN RETURN NEW; END IF;

  UPDATE public.drivers d
     SET subscription_status = NEW.status,
         subscription_expires_at = COALESCE(NEW.period_end, d.subscription_expires_at),
         updated_at = now()
   WHERE d.user_id = NEW.driver_id
     AND (
       d.subscription_status IS DISTINCT FROM NEW.status
       OR d.subscription_expires_at IS DISTINCT FROM COALESCE(NEW.period_end, d.subscription_expires_at)
     );

  RETURN NEW;
END;
$function$;
