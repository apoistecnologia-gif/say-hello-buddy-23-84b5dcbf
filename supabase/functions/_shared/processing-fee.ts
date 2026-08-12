export interface ProcessingFeeConfig {
  percentBps: number;
  minCents: number;
  maxCents: number;
}

function envInt(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function pixProcessingFeeConfig(): ProcessingFeeConfig {
  const minCents = envInt("PIX_PROCESSING_MIN_CENTS", 50);
  return {
    percentBps: envInt("PIX_PROCESSING_PERCENT_BPS", 80),
    minCents,
    maxCents: Math.max(minCents, envInt("PIX_PROCESSING_MAX_CENTS", 500)),
  };
}

export function calculatePixProcessingFeeCents(
  fareCents: number,
  config: ProcessingFeeConfig = pixProcessingFeeConfig(),
): number {
  const fare = Math.max(0, Math.trunc(fareCents));
  let fee = config.minCents;

  // Gross-up: the provider percentage is applied to the passenger total,
  // not only to the driver fare. Iterate to the stable cent value.
  for (let i = 0; i < 16; i += 1) {
    const percentageFee = Math.ceil(((fare + fee) * config.percentBps) / 10_000);
    const next = Math.min(config.maxCents, Math.max(config.minCents, percentageFee));
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
