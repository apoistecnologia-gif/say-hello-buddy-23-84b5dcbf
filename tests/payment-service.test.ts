import { describe, expect, test } from "bun:test";
import { normalizePaymentMethodCode, settingEnabled } from "../src/services/payments/payment-service";

describe("passenger payment contract", () => {
  test("normalizes provider aliases without accepting unknown methods", () => {
    expect(normalizePaymentMethodCode("pix")).toBe("pix");
    expect(normalizePaymentMethodCode("credit_card")).toBe("credit");
    expect(normalizePaymentMethodCode("debit_card")).toBe("debit");
    expect(normalizePaymentMethodCode("cash")).toBe("cash");
    expect(normalizePaymentMethodCode("wallet")).toBe("wallet");
    expect(normalizePaymentMethodCode("boleto")).toBeNull();
  });

  test("enables electronic payment gate only for explicit true values", () => {
    expect(settingEnabled(true)).toBe(true);
    expect(settingEnabled("true")).toBe(true);
    expect(settingEnabled({ enabled: true })).toBe(true);
    expect(settingEnabled(false)).toBe(false);
    expect(settingEnabled("false")).toBe(false);
    expect(settingEnabled({ enabled: false })).toBe(false);
    expect(settingEnabled({})).toBe(false);
    expect(settingEnabled(null)).toBe(false);
  });
});
