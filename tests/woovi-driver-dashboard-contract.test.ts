import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260812210000_provider_aware_driver_financial_dashboard.sql",
  "utf8",
);

describe("provider-aware driver financial dashboard", () => {
  test("uses canonical pending balance instead of deriving it from total minus available", () => {
    expect(migration).toContain("coalesce(v_wallet.pending_balance,0)*100");
    expect(migration).not.toContain("greatest(coalesce(v_wallet.balance,0)-coalesce(v_wallet.available_balance,0),0)");
  });

  test("supports Woovi payout binding while preserving Asaas rollback compatibility", () => {
    expect(migration).toContain("elsif v_provider='woovi' then");
    expect(migration).toContain("from public.driver_payment_accounts a");
    expect(migration).toContain("a.provider='woovi'");
    expect(migration).toContain("a.pix_key=v_destination.pix_key");
    expect(migration).toContain("woovi_subaccount_not_active");
    expect(migration).toContain("elsif v_provider='asaas' then");
    expect(migration).toContain("from public.driver_asaas_accounts a");
  });

  test("keeps homologation switch and Pix destination cooldown authoritative", () => {
    expect(migration).toContain("finance.driver_payouts_enabled");
    expect(migration).toContain("finance.target_payout_provider");
    expect(migration).toContain("pix_payout_destination_not_confirmed");
    expect(migration).toContain("pix_payout_destination_cooldown");
  });

  test("keeps the public RPC contract stable for the Motorista app", () => {
    expect(migration).toContain("create or replace function public.get_driver_financial_dashboard");
    expect(migration).toContain("select apois_rpc_private.get_driver_financial_dashboard($1,$2)");
  });
});
