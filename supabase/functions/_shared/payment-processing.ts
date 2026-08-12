export type ProcessingFeePolicy = {
  enabled: boolean;
  rateBps: number;
  minCents: number;
  maxCents: number;
};

export const DEFAULT_PIX_PROCESSING_FEE_POLICY: ProcessingFeePolicy = {
  enabled: false,
  rateBps: 80,
  minCents: 50,
  maxCents: 500,
};

function asSafeInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "sim"].includes(normalized)) return true;
    if (["false", "0", "no", "nao", "não"].includes(normalized)) return false;
  }
  return fallback;
}

export function processingFeePolicyFromSettings(
  settings: Record<string, unknown>,
  fallback: ProcessingFeePolicy = DEFAULT_PIX_PROCESSING_FEE_POLICY,
): ProcessingFeePolicy {
  return {
    enabled: asBoolean(settings["finance.ride_processing_fee_enabled"], fallback.enabled),
    rateBps: asSafeInteger(settings["finance.ride_processing_fee_rate_bps"], fallback.rateBps, 0, 10_000),
    minCents: asSafeInteger(settings["finance.ride_processing_fee_min_cents"], fallback.minCents, 0, 100_000),
    maxCents: asSafeInteger(settings["finance.ride_processing_fee_max_cents"], fallback.maxCents, 0, 100_000),
  };
}

/**
 * Returns the smallest passenger-paid fee (in cents) that covers the configured
 * provider fee when that provider fee is calculated over the full passenger charge.
 * Monetary math stays integer-only and rounds provider percentage upward to avoid
 * under-collecting a cent because of floating-point/rounding differences.
 */
export function calculateProcessingFeeCents(
  fareCents: number,
  policy: ProcessingFeePolicy,
): number {
  const safeFareCents = Math.max(0, Math.trunc(fareCents));
  if (!policy.enabled || safeFareCents <= 0) return 0;

  const minCents = Math.max(0, Math.trunc(policy.minCents));
  const maxCents = Math.max(minCents, Math.trunc(policy.maxCents));
  const rateBps = Math.max(0, Math.min(10_000, Math.trunc(policy.rateBps)));

  if (rateBps === 0) return Math.min(maxCents, minCents);

  let feeCents = minCents;
  for (let iteration = 0; iteration < 16; iteration += 1) {
    const passengerTotalCents = safeFareCents + feeCents;
    const percentageFeeCents = Math.ceil((passengerTotalCents * rateBps) / 10_000);
    const requiredFeeCents = Math.min(maxCents, Math.max(minCents, percentageFeeCents));
    if (requiredFeeCents <= feeCents) return feeCents;
    feeCents = requiredFeeCents;
  }

  return Math.min(maxCents, feeCents);
}

export function centsFromBrl(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 100));
}

export function brlFromCents(value: number): number {
  return Math.round(Math.max(0, Math.trunc(value))) / 100;
}
