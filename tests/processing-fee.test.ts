import { describe, expect, test } from "bun:test";
import {
  calculatePassengerPaymentBreakdown,
  calculatePixProcessingFee,
  calculatePixProcessingFeeCents,
} from "../src/services/payments/processing-fee";

describe("Pix processing fee", () => {
  test("uses the R$ 0,50 minimum for typical urban fares", () => {
    expect(calculatePixProcessingFee(28.5)).toBe(0.5);
    expect(calculatePassengerPaymentBreakdown(28.5, "pix")).toEqual({
      fareAmount: 28.5,
      processingFee: 0.5,
      passengerTotal: 29,
      driverEarning: 28.5,
      platformCommission: 0,
    });
  });

  test("grosses up percentage so the processing fee covers the total charged", () => {
    expect(calculatePixProcessingFee(70)).toBe(0.57);
    expect(calculatePixProcessingFee(100)).toBe(0.81);
    expect(calculatePixProcessingFee(200)).toBe(1.62);
  });

  test("caps the processing fee at R$ 5,00", () => {
    expect(calculatePixProcessingFeeCents(100_000)).toBe(500);
  });

  test("does not charge Pix processing fee for cash", () => {
    expect(calculatePassengerPaymentBreakdown(28.5, "cash")).toEqual({
      fareAmount: 28.5,
      processingFee: 0,
      passengerTotal: 28.5,
      driverEarning: 28.5,
      platformCommission: 0,
    });
  });
});
