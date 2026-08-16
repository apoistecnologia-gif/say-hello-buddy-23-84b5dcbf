import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const checkout = readFileSync("supabase/functions/woovi-create-ride-pix/index.ts", "utf8");
const account = readFileSync("supabase/functions/driver-woovi-payment-account/index.ts", "utf8");
const gate = readFileSync("supabase/migrations/20260812211500_gate_ride_pix_provider_cutover.sql", "utf8");

describe("Woovi runtime provider gates", () => {
  test("only creates fresh Woovi charges for rides stamped with the active Woovi provider", () => {
    expect(checkout).toContain('String(ride.payment_provider ?? "").toLowerCase() !== "woovi"');
    expect(checkout).toContain('error: "electronic_payment_provider_not_woovi"');
    expect(checkout).toContain('action === "recover" && existingPayment');
    expect(checkout.indexOf('action === "recover" && existingPayment')).toBeLessThan(
      checkout.indexOf('error: "electronic_payment_provider_not_woovi"'),
    );
  });

  test("only provisions Woovi subaccounts after the payout target explicitly switches to Woovi", () => {
    expect(account).toContain('eq("key", "finance.target_payout_provider")');
    expect(account).toContain('jsonSettingString(providerSetting?.value) !== "woovi"');
    expect(account).toContain('error: "payout_provider_not_woovi"');
  });

  test("database independently rejects new payment attempts from an inactive provider", () => {
    expect(gate).toContain("create or replace function private.enforce_new_ride_pix_provider()");
    expect(gate).toContain("electronic_payment_provider_not_active");
    expect(gate).toContain("before insert on public.ride_pix_payments");
    expect(gate).toContain("ride_payment_provider_mismatch");
  });
});
