export interface ProcessingFeeConfig {
  percentBps: number;
  minCents: number;
  maxCents: number;
}

export const DEFAULT_PIX_PROCESSING_FEE: ProcessingFeeConfig = {
  percentBps: 80,
  minCents: 50,
  maxCents: 500,
};

function toCents(amount: number): number {
  return Math.max(0, Math.round(amount * 100));
}

function fromCents(cents: number): number {
  return cents / 100;
}

export function calculatePixProcessingFeeCents(
  fareCents: number,
  config: ProcessingFeeConfig = DEFAULT_PIX_PROCESSING_FEE,
): number {
  const normalizedFare = Math.max(0, Math.trunc(fareCents));
  const percentBps = Math.max(0, Math.trunc(config.percentBps));
  const minCents = Math.max(0, Math.trunc(config.minCents));
  const maxCents = Math.max(minCents, Math.trunc(config.maxCents));

  let feeCents = minCents;
  for (let iteration = 0; iteration < 16; iteration += 1) {
    const percentageFee = Math.ceil(((normalizedFare + feeCents) * percentBps) / 10_000);
    const nextFee = Math.min(maxCents, Math.max(minCents, percentageFee));
    if (nextFee === feeCents) return feeCents;
    feeCents = nextFee;
  }

  return feeCents;
}

export function calculatePixProcessingFee(
  fareAmount: number,
  config: ProcessingFeeConfig = DEFAULT_PIX_PROCESSING_FEE,
): number {
  return fromCents(calculatePixProcessingFeeCents(toCents(fareAmount), config));
}

export function calculatePassengerPaymentBreakdown(
  fareAmount: number,
  paymentMethod: string | null | undefined,
  config: ProcessingFeeConfig = DEFAULT_PIX_PROCESSING_FEE,
) {
  const fareCents = toCents(fareAmount);
  const processingFeeCents =
    paymentMethod === "pix" ? calculatePixProcessingFeeCents(fareCents, config) : 0;

  return {
    fareAmount: fromCents(fareCents),
    processingFee: fromCents(processingFeeCents),
    passengerTotal: fromCents(fareCents + processingFeeCents),
    driverEarning: fromCents(fareCents),
    platformCommission: 0,
  } as const;
}
