import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const payout = readFileSync("supabase/functions/request-driver-payout/index.ts", "utf8");

describe("driver payout provider routing contract", () => {
  test("requires the database payout safety switch before reserving money", () => {
    expect(payout).toContain("finance.driver_payouts_enabled");
    expect(payout).toContain("driver_payouts_disabled");
    expect(payout.indexOf("driver_payouts_disabled")).toBeLessThan(payout.indexOf("driver_request_withdrawal"));
  });

  test("reads the configured payout provider", () => {
    expect(payout).toContain("finance.target_payout_provider");
    expect(payout).toContain("payout_provider_adapter_unavailable");
  });

  test("keeps PagBank payout explicitly disabled until homologation", () => {
    expect(payout).toContain("pagbank_payout_not_homologated");
  });

  test("keeps the existing Woovi adapter behind the provider gate", () => {
    expect(payout).toContain('payoutGate.provider !== "woovi"');
    expect(payout).toContain("WOOVI_API_BASE_URL");
  });
});
