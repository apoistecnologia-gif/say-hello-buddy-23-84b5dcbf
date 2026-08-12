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
  });

  test("does not refund or replay ambiguous payouts", () => {
    const payout = source("supabase/functions/request-driver-payout/index.ts");
    expect(payout).toContain('withdrawal.status === "processing"');
    expect(payout).toContain("reconciliationRequired: true");
    expect(payout).toContain("Never refund");
    expect(payout).toContain("provider_timeout_reconciliation_required");
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
});
