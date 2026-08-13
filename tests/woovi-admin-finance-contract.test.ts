import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260812210500_provider_aware_admin_finance_summary.sql",
  "utf8",
);

describe("provider-aware Admin finance summary", () => {
  test("reads configured provider switches instead of returning placeholders", () => {
    expect(migration).toContain("finance.target_electronic_payment_provider");
    expect(migration).toContain("finance.target_payout_provider");
    expect(migration).toContain("'electronic_payment_provider',v_electronic_provider");
    expect(migration).toContain("'payout_provider',v_payout_provider");
    expect(migration).not.toContain("'electronic_payment_provider', null");
    expect(migration).not.toContain("'payout_provider', null");
  });

  test("keeps settlement provider and real provider fee visible to finance admins", () => {
    expect(migration).toContain("'payment_provider',payment_provider");
    expect(migration).toContain("'payment_provider_fee_cents'");
    expect(migration).toContain("sum(payment_provider_fee)");
  });

  test("does not mutate provider switches", () => {
    expect(migration.toLowerCase()).not.toContain("update public.app_settings");
    expect(migration.toLowerCase()).not.toContain("insert into public.app_settings");
  });
});
