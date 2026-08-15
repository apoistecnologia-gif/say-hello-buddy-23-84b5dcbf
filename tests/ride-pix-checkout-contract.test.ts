import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const checkoutRouter = readFileSync(
  "supabase/functions/ride-pix-checkout/index.ts",
  "utf8",
);
const pixCard = readFileSync(
  "src/components/payments/RidePixPaymentCard.tsx",
  "utf8",
);
const passengerRideRequest = readFileSync(
  "supabase/functions/passenger-ride-request/index.ts",
  "utf8",
);

describe("canonical passenger Pix checkout contract", () => {
  test("routes provider-specific charge creation only on the backend", () => {
    expect(checkoutRouter).toContain('asaas: "asaas-create-ride-pix"');
    expect(checkoutRouter).toContain('pagbank: "pagbank-create-ride-pix"');
    expect(checkoutRouter).toContain('woovi: "woovi-create-ride-pix"');
    expect(checkoutRouter).toContain("ride.payment_provider");

    expect(pixCard).toContain('"ride-pix-checkout"');
    expect(pixCard).not.toContain('supabase.functions.invoke<PixCheckout>(\n        "asaas-create-ride-pix"');
    expect(pixCard).not.toContain('supabase.functions.invoke<PixCheckout>(\n        "pagbank-create-ride-pix"');
    expect(pixCard).not.toContain('supabase.functions.invoke<PixCheckout>(\n        "woovi-create-ride-pix"');
  });

  test("keeps the passenger financial split visible and server-authoritative", () => {
    expect(checkoutRouter).toContain("fare_amount_cents");
    expect(checkoutRouter).toContain("processing_fee_cents");
    expect(checkoutRouter).toContain("passenger_charge_cents");
    expect(checkoutRouter).toContain("totalSnapshot !== fareSnapshot + feeSnapshot");
    expect(checkoutRouter).toContain("returnedAmount !== snapshot.passengerChargeCents");

    expect(pixCard).toContain("Valor da corrida");
    expect(pixCard).toContain("Taxa de processamento");
    expect(pixCard).toContain("Total do Pix");
  });

  test("lets the database trigger stamp the active prepaid Pix provider", () => {
    expect(passengerRideRequest).toContain("payment_provider: null");
    expect(passengerRideRequest).not.toContain('payment_provider: isPrepaidPix ? "asaas" : null');
  });
});
