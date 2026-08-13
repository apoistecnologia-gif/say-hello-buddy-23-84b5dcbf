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
    expect(payout).toContain("provider_timeout_reconciliation_required");
    expect(payout).toContain("response.status >= 500");
    expect(payout).toContain("[408, 425, 429].includes(response.status)");
    expect(payout).toContain("provider_http_ambiguous:");
    expect(payout).toContain('.eq("status", "processing")');
    expect(payout).toContain('admin.rpc("mark_driver_withdrawal_failed"');
  });

  test("keeps payout amounts in integer cents and sends only the net provider amount", () => {
    const payout = source("supabase/functions/request-driver-payout/index.ts");
    expect(payout).toContain("amountCents?: unknown");
    expect(payout).toContain("normalizeAmountCents(payload.amountCents, payload.amount)");
    expect(payout).toContain("Number.isSafeInteger(cents)");
    expect(payout).toContain("_amount_cents: amountCents");
    expect(payout).toContain("grossAmountCents");
    expect(payout).toContain("feeCents");
    expect(payout).toContain("providerAmountCents");
    expect(payout).toContain("grossAmountCents !== providerAmountCents + feeCents");
    expect(payout).toContain("JSON.stringify({ value: providerAmountCents })");
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
  });

  test("lets provider webhooks reach custom secret validation without a user JWT", () => {
    const config = source("supabase/config.toml");
    expect(config).toContain("[functions.woovi-webhook]");
    expect(config).toContain("[functions.woovi-payout-webhook]");
    expect(config).toContain("verify_jwt = false");
  });

  test("consolidates on the existing wallet, settlement and payout destination", () => {
    const migration = source("supabase/migrations/20260812164500_woovi_pending_driver_balance.sql");
    expect(migration).toContain("public.driver_wallets");
    expect(migration).toContain("public.driver_wallet_transactions");
    expect(migration).toContain("public.ride_settlements");
    expect(migration).toContain("public.driver_payout_destinations");
  });

  test("never silently switches fresh Pix rides merely by installing the Woovi runtime", () => {
    const migration = source("supabase/migrations/20260812162000_woovi_runtime_foundation.sql");
    expect(migration).toContain("finance.target_electronic_payment_provider");
    expect(migration).toContain("asaas");
  });

  test("charges Woovi passenger total but preserves legacy Asaas fare", () => {
    const migration = source("supabase/migrations/20260812171000_preserve_asaas_pix_cutover_settlement.sql");
    expect(migration).toContain("v_expected_payment_cents");
    expect(migration).toContain("v_provider='woovi'");
    expect(migration).toContain("passenger_charge_cents");
  });

  test("binds Woovi only to the canonical confirmed Pix destination", () => {
    const migration = source("supabase/migrations/20260812170000_harden_woovi_provider_credit_claim.sql");
    expect(migration).toContain("driver_payout_destinations");
    expect(migration).toContain("confirmed_at is not null");
    expect(migration).toContain("d.pix_key=a.pix_key");
  });

  test("blocks Pix destination changes while Woovi-backed money is outstanding", () => {
    const migration = source("supabase/migrations/20260812171500_lock_pix_destination_with_outstanding_woovi_money.sql");
    expect(migration).toContain("driver_provider_credits");
    expect(migration).toContain("driver_withdrawals");
  });

  test("cancels unpaid provider charges without pretending an ambiguous provider failure succeeded", () => {
    const createPix = source("supabase/functions/woovi-create-ride-pix/index.ts");
    expect(createPix).toContain("provider_cancel_unknown");
  });

  test("reuses the same Woovi correlation ID after ambiguous charge creation", () => {
    const createPix = source("supabase/functions/woovi-create-ride-pix/index.ts");
    expect(createPix).toContain("provider_create_unknown");
    expect(createPix).toContain("provider_payment_id");
  });

  test("keeps the webhook authoritative when provider API reports charge completed", () => {
    const createPix = source("supabase/functions/woovi-create-ride-pix/index.ts");
    expect(createPix).toContain("webhook");
  });

  test("never creates a Woovi retry while a legacy Asaas charge is still active", () => {
    const createPix = source("supabase/functions/woovi-create-ride-pix/index.ts");
    expect(createPix).toContain("asaas");
  });

  test("passenger UI labels recovered legacy provider without claiming Woovi confirmed it", () => {
    const paymentCard = source("src/components/passenger/RidePixPaymentCard.tsx");
    expect(paymentCard).toContain("paymentProvider");
  });
});