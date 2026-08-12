export interface ProcessingFeeConfig {
  percentBps: number;
  minCents: number;
  maxCents: number;
}

// Canonical Woovi processing-fee contract. Keep these values coordinated with
// private.calculate_pix_processing_fee_cents() in the database migration.
// Do not make them independently configurable through Edge Function secrets:
// server/runtime drift could charge a different amount from the database guard.
export const PIX_PROCESSING_FEE: ProcessingFeeConfig = {
  percentBps: 80,
  minCents: 50,
  maxCents: 500,
};

export function pixProcessingFeeConfig(): ProcessingFeeConfig {
  return PIX_PROCESSING_FEE;
}

export function calculatePixProcessingFeeCents(
  fareCents: number,
  config: ProcessingFeeConfig = PIX_PROCESSING_FEE,
): number {
  const fare = Math.max(0, Math.trunc(fareCents));
  const percentBps = Math.max(0, Math.trunc(config.percentBps));
  const minCents = Math.max(0, Math.trunc(config.minCents));
  const maxCents = Math.max(minCents, Math.trunc(config.maxCents));
  let fee = minCents;

  // Gross-up: the provider percentage is applied to the passenger total,
  // not only to the driver fare. Iterate to the stable cent value.
  for (let i = 0; i < 16; i += 1) {
    const percentageFee = Math.ceil(((fare + fee) * percentBps) / 10_000);
    const next = Math.min(maxCents, Math.max(minCents, percentageFee));
    if (next === fee) return fee;
    fee = next;
  }

  return fee;
}

export function paymentBreakdownCents(fareCents: number, paymentMethod: string | null | undefined) {
  const fare = Math.max(0, Math.trunc(fareCents));
  const method = (paymentMethod ?? "").trim().toLowerCase();
  const processingFee = method === "pix" ? calculatePixProcessingFeeCents(fare) : 0;

  return {
    fareCents: fare,
    processingFeeCents: processingFee,
    passengerChargeCents: fare + processingFee,
    driverEarningCents: fare,
    platformCommissionCents: 0,
  } as const;
}
