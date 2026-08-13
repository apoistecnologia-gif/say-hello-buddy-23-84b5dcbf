import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Woovi financial safety contracts", () => {
  test("preserves historical Asaas Pix rows while allowing Woovi", () => {
    const migration = source("supabase/migrations/20260812165000_allow_woovi_ride_pix_provider.sql");
    expect(migration).toContain("check (provider in ('asaas', 'woovi'))");
  });

  test("keeps the processing-fee formula canonical instead of secret-configurable", () => {
    const shared = source("supabase/functions/_shared/processing-fee.ts");
    const migration = source("supabase/migrations/20260812151000_woovi_server_side_fee_trigger.sql");
    expect(shared).not.toContain("Deno.env.get(\"PIX_PROCESSING_");
    expect(shared).toContain("percentBps: 80");
    expect(shared).toContain("minCents: 50");
    expect(shared).toContain("maxCents: 500");
    expect(migration).toContain("* 80) / 10000");
    expect(migration).toContain("greatest(50::bigint");
    expect(migration).toContain("least(500::bigint");
  });

  test("never reclaims an ambiguous processing driver credit", () => {
    const migration = source("supabase/migrations/20260812170000_harden_woovi_provider_credit_claim.sql");
    expect(migration).toContain("c.status = 'pending'");
    expect(migration).toContain("coalesce(c.last_error,'') like 'safe_retry:%'");
    expect(migration).not.toContain("c.status = 'processing'");
  });

  test("reconciles ambiguous driver credits against the Woovi statement", () => {
    const worker = source("supabase/functions/driver-woovi-credit/index.ts");
    expect(worker).toContain("/statement");
    expect(worker).toContain("reconciliation_required:");
    expect(worker).toContain("creditDescription(credit.ride_id)");
    expect(worker).toContain('entryType === "CREDIT" || operationType === "CREDIT"');
    expect(worker).toContain("Number(entry.value) === expectedAmount");
    expect(worker).toContain("response.status >= 500");
    expect(worker).toContain("[408, 425, 429].includes(response.status)");
    expect(worker).toContain("provider_http_ambiguous:");
  });

  test("does not refund or replay ambiguous payouts", () => {
    const payout = source("supabase/functions/request-driver-payout/index.ts");
    expect(payout).toContain('withdrawal.status === "processing"');
    expect(payout).toContain("reconciliationRequired: true");
    expect(payout).toContain("Never refund");
    expect(payout).toContain("provider_timeout_reconciliation_required");
    expect(payout).toContain("response.status >= 500");
    expect(payout).toContain("[408, 425, 429].includes(response.status)");
    expect(payout).toContain("provider_http_ambiguous:");
    expect(payout).toContain("ambiguous HTTP persist");
  });

  test("keeps payout amounts in integer cents across the driver and backend contract", () => {
    const payout = source("supabase/functions/request-driver-payout/index.ts");
    expect(payout).toContain("amountCents?: unknown");
    expect(payout).toContain("normalizeAmountCents(payload.amountCents, payload.amount)");
    expect(payout).toContain("Number.isSafeInteger(cents)");
    expect(payout).toContain("_amount_cents: amountCents");
    expect(payout).toContain("JSON.stringify({ value: amountCents })");
  });

  test("serializes payout reservations and enforces idempotency in the database", () => {
    const migration = source("supabase/migrations/20260812170500_harden_driver_withdrawal_idempotency.sql");
    expect(migration).toContain("driver_withdrawals_driver_idempotency_uidx");
    expect(migration).toContain("on public.driver_withdrawals(driver_id, idempotency_key)");
    expect(migration).toContain("for update");
    expect(migration).toContain("w.idempotency_key=_idempotency_key");
  });

  test("keeps legacy paid Asaas Pix completable during the Woovi cutover", () => {
    const migration = source("supabase/migrations/20260812171000_preserve_asaas_pix_cutover_settlement.sql");
    expect(migration).toContain("v_provider not in ('asaas','woovi')");
    expect(migration).toContain("and provider = v_provider");
    expect(migration).toContain("when v_provider = 'woovi' then coalesce(v_ride.passenger_charge_cents, v_driver_earning_cents)");
    expect(migration).toContain("available_balance=available_balance+v_amount");
    expect(migration).toContain("pending_balance=pending_balance+v_amount");
  });

  test("persists the actual provider fee from a completed Woovi charge", () => {
    const webhook = source("supabase/functions/woovi-webhook/index.ts");
    expect(webhook).toContain("charge.fee ?? pix?.fee");
    expect(webhook).toContain("paymentUpdate.provider_fee_cents = providerFeeCents");
  });

  test("keeps completed Pix earnings pending until provider credit succeeds", () => {
    const migration = source("supabase/migrations/20260812164500_woovi_pending_driver_balance.sql");
    expect(migration).toContain("pending_balance=pending_balance+v_amount");
    expect(migration).toContain("pending_balance=pending_balance-v_amount");
    expect(migration).toContain("available_balance=available_balance+v_amount");
  });

  test("uses the live webhook receipt schema and explicit Woovi activation", () => {
    const webhook = source("supabase/functions/woovi-webhook/index.ts");
    expect(webhook).toContain('.eq("event_key", eventId)');
    expect(webhook).toContain('event_key: eventId');
    expect(webhook).not.toContain("provider_event_id");
    expect(webhook).toContain('_provider: "woovi"');
  });

  test("lets provider webhooks reach custom secret validation without a user JWT", () => {
    const config = source("supabase/config.toml");
    const chargeWebhook = source("supabase/functions/woovi-webhook/index.ts");
    const payoutWebhook = source("supabase/functions/woovi-payout-webhook/index.ts");
    expect(config).toContain("[functions.woovi-webhook]\nverify_jwt = false");
    expect(config).toContain("[functions.woovi-payout-webhook]\nverify_jwt = false");
    expect(config).toContain("[functions.woovi-create-ride-pix]\nverify_jwt = true");
    expect(config).toContain("[functions.driver-woovi-payment-account]\nverify_jwt = true");
    expect(chargeWebhook).toContain('req.headers.get("x-openpix-authorization")');
    expect(payoutWebhook).toContain('req.headers.get("x-openpix-authorization")');
    expect(chargeWebhook).toContain('"WOOVI:CHARGE_COMPLETED"');
  });

  test("consolidates on the existing wallet, settlement and payout destination", () => {
    const migration = source("supabase/migrations/20260812205000_consolidate_woovi_financial_cutover.sql");
    expect(migration).toContain("public.driver_payout_destinations");
    expect(migration).toContain("public.driver_wallets");
    expect(migration).toContain("public.driver_wallet_transactions");
    expect(migration).toContain("public.driver_withdrawals");
    expect(migration).toContain("public.ride_settlements");
    expect(migration).toContain("driver_payout_destinations remains authoritative");
    expect(migration).toContain("finance.driver_payouts_enabled remains false");
  });

  test("charges Woovi passenger total but preserves legacy Asaas fare", () => {
    const migration = source("supabase/migrations/20260812205000_consolidate_woovi_financial_cutover.sql");
    expect(migration).toContain("when v_provider='woovi' then coalesce(v_ride.passenger_charge_cents");
    expect(migration).toContain("else round(v_ride.estimated_price*100)::bigint");
    expect(migration).toContain("payment_provider=v_provider");
    expect(migration).toContain("return public.activate_prepaid_pix_ride(_ride_id,_provider_payment_id,v_provider)");
  });

  test("binds Woovi only to the canonical confirmed Pix destination", () => {
    const account = source("supabase/functions/driver-woovi-payment-account/index.ts");
    expect(account).toContain('.from("driver_payout_destinations")');
    expect(account).toContain("pix_key_must_match_payout_destination");
    expect(account).toContain("pix_payout_destination_cooldown");
    expect(account).toContain("payout_destination_changed_during_binding");
  });

  test("blocks Pix destination changes while Woovi-backed money is outstanding", () => {
    const migration = source("supabase/migrations/20260812205500_guard_woovi_pix_destination_change.sql");
    expect(migration).toContain("coalesce(v_wallet.balance,0) > 0");
    expect(migration).toContain("coalesce(v_wallet.pending_balance,0) > 0");
    expect(migration).toContain("c.status in ('pending','processing')");
    expect(migration).toContain("withdraw_balance_before_pix_change");
    expect(migration).toContain("now()+interval '24 hours'");
  });

  test("cancels unpaid provider charges without pretending an ambiguous provider failure succeeded", () => {
    const cancellation = source("supabase/functions/cancel-ride/index.ts");
    expect(cancellation).toContain('`${ASAAS_BASE_URL}/payments/${encodeURIComponent(paymentId)}`');
    expect(cancellation).toContain('`${WOOVI_API_BASE_URL}/api/v1/charge/${encodeURIComponent(paymentId)}`');
    expect(cancellation).toContain('.in("status", ["creating", "pending", "confirmed"])');
    expect(cancellation).toContain('action: "ride_payment_cancel_reconciliation_required"');
    expect(cancellation).toContain("payment_reconciliation_required");
    expect(cancellation).toContain("provider_delete_failed:");
    expect(cancellation).toContain('.update({ status: "cancelled", updated_at: new Date().toISOString() })');
  });

  test("reuses the same Woovi correlation ID after ambiguous charge creation", () => {
    const checkout = source("supabase/functions/woovi-create-ride-pix/index.ts");
    expect(checkout).toContain("return_existing=true");
    expect(checkout).toContain("REQUEST_TIMEOUT_MS = 15_000");
    expect(checkout).toContain("response.status >= 500");
    expect(checkout).toContain("[408, 425, 429].includes(response.status)");
    expect(checkout).toContain("reconciliationRequired: true");
    expect(checkout).toContain("createOrRecoverProviderCharge(");
    expect(checkout).toContain("existingPayment.provider_payment_id");
    expect(checkout).toContain("Only an explicit provider terminal state authorizes a new attempt");
    expect(checkout).toContain("Keep the row in `creating`");
  });

  test("never creates a Woovi retry while a legacy Asaas charge is still active", () => {
    const checkout = source("supabase/functions/woovi-create-ride-pix/index.ts");
    expect(checkout).toContain("provider,provider_payment_id");
    expect(checkout).toContain('existingPayment?.provider === "asaas"');
    expect(checkout).toContain('error: "legacy_asaas_charge_active"');
    expect(checkout).toContain('legacy: payment.provider === "asaas"');
    expect(checkout).toContain('provider: payment.provider');
    expect(checkout).toContain('existingPayment?.provider === "woovi"');
    expect(checkout).toContain('.eq("provider", "woovi")');
  });

  test("passenger UI labels recovered legacy provider without claiming Woovi confirmed it", () => {
    const card = source("src/components/payments/RidePixPaymentCard.tsx");
    expect(card).toContain('provider?: "asaas" | "woovi" | string');
    expect(card).toContain('case "legacy_asaas_charge_active"');
    expect(card).toContain('toast.success("Pagamento Pix confirmado pelo backend.")');
    expect(card).toContain('Cobrança processada por {providerLabel}.');
    expect(card).not.toContain("Pagamento Pix confirmado pela Woovi.");
  });
});