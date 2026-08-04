import { readFileSync } from "node:fs";

function source(path) {
  return readFileSync(path, "utf8");
}

function requireText(path, patterns) {
  const text = source(path);
  for (const pattern of patterns) {
    if (!text.includes(pattern)) {
      throw new Error(`${path}: invariável ausente: ${pattern}`);
    }
  }
}

requireText("supabase/functions/_shared/mercadopago.ts", [
  "chargeId",
  "X-Idempotency-Key",
  "subscription:${args.chargeId}",
  ".update({",
  '.eq("driver_id", args.driver.user_id)',
]);
requireText("supabase/functions/mercadopago-webhook/index.ts", [
  "metadata?.charge_id",
  "sameApprovedPayment",
  "charged_back",
  "reverse_cancellation_fee_settlement",
  "payment_identity_conflict",
  "REMAINING_PERIODS_LOOKUP_FAILED",
  "PERIOD_SHIFT_FAILED",
]);
requireText("supabase/functions/request-ride/index.ts", [
  "GOOGLE_ROUTES_URL",
  "request_key",
  "redispatch",
  "passenger_debt_block",
  "SEARCH_TIMEOUT_SECONDS",
  "period_start.is.null",
]);
requireText("supabase/migrations/20260726010000_round2_finance_dispatch_compliance.sql", [
  "ranked_live_rides",
  "ux_rides_one_live_passenger",
  "ux_subscriptions_provider_payment_id",
  "NEW.cancelled_by IS DISTINCT FROM NEW.passenger_id",
  "search_expires_at = scheduled_for + interval '15 minutes'",
  "account_deletion_requests",
]);
requireText("supabase/functions/delete-my-account/index.ts", [
  "removeStorageFolder",
  "anonymize_user",
  "anonymize_driver",
  "admin.auth.admin.deleteUser(",
]);
requireText("src/routes/api/driver/rides/action.ts", ["confirm_payment"]);

console.log("Invariáveis críticas de lançamento verificadas.");
