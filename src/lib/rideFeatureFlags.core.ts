export type RideFeatureFlags = {
  feature_guincho_enabled: boolean;
  feature_fretes_enabled: boolean;
};

export const DISABLED_RIDE_FEATURE_FLAGS: RideFeatureFlags = {
  feature_guincho_enabled: false,
  feature_fretes_enabled: false,
};

function readBoolean(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
}

export function parseRideFeatureFlags(value: unknown): RideFeatureFlags {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return { ...DISABLED_RIDE_FEATURE_FLAGS };
  const record = row as Record<string, unknown>;
  return {
    feature_guincho_enabled: readBoolean(record["feature_guincho_enabled"]),
    feature_fretes_enabled: readBoolean(record["feature_fretes_enabled"]),
  };
}

export function isRideCategoryEnabled(
  category: string | null | undefined,
  flags: RideFeatureFlags,
): boolean {
  const normalized = String(category ?? "").trim().toLowerCase();
  if (normalized === "guincho") return flags.feature_guincho_enabled;
  if (normalized === "fretes") return flags.feature_fretes_enabled;
  return true;
}
