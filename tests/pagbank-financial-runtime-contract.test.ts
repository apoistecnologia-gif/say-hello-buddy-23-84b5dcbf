import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260815154500_pagbank_canonical_financial_runtime.sql",
  "utf8",
);
const webhook = readFileSync("supabase/functions/pagbank-webhook/index.ts", "utf8");
const checkout = readFileSync("supabase/functions/ride-pix-checkout/index.ts", "utf8");

describe("PagBank canonical financial runtime", () => {
  test("keeps provider selection database-owned and supports PagBank", () => {
    expect(migration).toContain("v_target_provider not in ('asaas','woovi','pagbank')");
    expect(migration).toContain("new.payment_provider := v_target_provider");
    expect(migration).toContain("trg_enforce_ride_payment_breakdown");
  });

  test("settles PagBank Pix from the server financial snapshot", () => {
    expect(migration).toContain("v_provider not in ('asaas','woovi','pagbank')");
    expect(migration).toContain("v_passenger_charge_cents <> v_fare_cents + v_processing_fee_cents");
    expect(migration).toContain("v_payment.amount_cents <> v_passenger_charge_cents");
    expect(migration).toContain("v_ride.driver_id,v_fare_amount,'credit','ride'");
  });

  test("preserves the Woovi pending-balance credit path", () => {
    expect(migration).toContain("if v_provider='woovi' then");
    expect(migration).toContain("pending_balance=pending_balance+v_fare_amount");
    expect(migration).toContain("'woovi:ride-credit:'||v_ride.id::text");
  });

  test("handles PagBank cumulative partial refunds before PAID activation", () => {
    expect(webhook).toContain("if (refundedCents > 0)");
    expect(webhook.indexOf("if (refundedCents > 0)")).toBeLessThan(webhook.indexOf('if (chargeStatus === "PAID")'));
    expect(webhook).toContain('admin.rpc("reconcile_pagbank_ride_refund"');
    expect(webhook).toContain('status: fullRefund ? "refunded" : "partially_refunded"');
  });

  test("refund reconciliation is cumulative and processing-fee aware", () => {
    expect(migration).toContain("refund_amount_regressed");
    expect(migration).toContain("v_target_driver_debit");
    expect(migration).toContain("_refunded_amount_cents-v_processing_fee_cents");
    expect(migration).toContain("driver_wallet_debit_delta");
  });

  test("provider-neutral checkout routes PagBank through its adapter", () => {
    expect(checkout).toContain('pagbank: "pagbank-create-ride-pix"');
  });
});
