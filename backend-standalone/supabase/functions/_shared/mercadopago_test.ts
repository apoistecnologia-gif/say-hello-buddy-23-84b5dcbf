import { calculatePaidPeriod } from "./mercadopago.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

Deno.test("starts the first paid period at approval time", () => {
  const period = calculatePaidPeriod(new Date("2026-07-25T12:00:00.000Z"), null, 30);
  assertEquals(period.periodStart, "2026-07-25T12:00:00.000Z");
  assertEquals(period.periodEnd, "2026-08-24T12:00:00.000Z");
});

Deno.test("preserves remaining paid days on an early renewal", () => {
  const period = calculatePaidPeriod(
    new Date("2026-07-25T12:00:00.000Z"),
    "2026-08-10T12:00:00.000Z",
    30,
  );
  assertEquals(period.periodStart, "2026-08-10T12:00:00.000Z");
  assertEquals(period.periodEnd, "2026-09-09T12:00:00.000Z");
});
