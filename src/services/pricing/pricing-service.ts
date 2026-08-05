import { supabase } from "@/integrations/supabase/client";
import { PricingRequest, PricingResponse, FareEstimate } from "@/types/pricing";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function parseEstimate(value: unknown): FareEstimate {
  if (!isRecord(value)) {
    throw new Error("pricing_invalid_response");
  }

  const categoryId = readString(value, "categoryId") ?? readString(value, "category_id");
  const estimatedPrice =
    readNumber(value, "estimatedPrice") ??
    readNumber(value, "estimated_price") ??
    readNumber(value, "total");

  if (!categoryId || estimatedPrice === undefined) {
    throw new Error("pricing_invalid_response");
  }

  const estimate: FareEstimate = {
    categoryId,
    available: readBoolean(value, "available") ?? true,
    estimatedPrice,
    originalPrice: readNumber(value, "originalPrice") ?? estimatedPrice,
    minimumPriceApplied: readBoolean(value, "minimumPriceApplied") ?? false,
    pricingVersion: readString(value, "pricingVersion") ?? "backend-v1",
  };

  const categoryKey = readString(value, "category_key");
  const total = readNumber(value, "total");
  const estimatedPickupMinutes = readNumber(value, "estimatedPickupMinutes");
  const unavailableReason = readString(value, "unavailableReason");
  const extrasTotal = readNumber(value, "extrasTotal");
  const baseFare = readNumber(value, "base_fare");
  const distanceFare = readNumber(value, "distance_fare");
  const durationFare = readNumber(value, "duration_fare");
  const minFare = readNumber(value, "min_fare");

  if (categoryKey) estimate.category_key = categoryKey;
  if (total !== undefined) estimate.total = total;
  if (estimatedPickupMinutes !== undefined) {
    estimate.estimatedPickupMinutes = estimatedPickupMinutes;
  }
  if (unavailableReason) estimate.unavailableReason = unavailableReason;
  if (extrasTotal !== undefined) estimate.extrasTotal = extrasTotal;
  if (baseFare !== undefined) estimate.base_fare = baseFare;
  if (distanceFare !== undefined) estimate.distance_fare = distanceFare;
  if (durationFare !== undefined) estimate.duration_fare = durationFare;
  if (minFare !== undefined) estimate.min_fare = minFare;

  return estimate;
}

function parsePricingResponse(value: unknown): PricingResponse {
  if (!isRecord(value) || value["ok"] !== true || !Array.isArray(value["estimates"])) {
    const message = isRecord(value) ? readString(value, "error") : undefined;
    throw new Error(message ?? "pricing_invalid_response");
  }

  return {
    currency: readString(value, "currency") ?? "BRL",
    estimates: value["estimates"].map(parseEstimate),
  };
}

class PricingService {
  private static instance: PricingService;
  private cache = new Map<string, { response: PricingResponse; timestamp: number }>();
  private readonly CACHE_TTL = 30000;

  private constructor() {}

  public static getInstance(): PricingService {
    if (!PricingService.instance) {
      PricingService.instance = new PricingService();
    }
    return PricingService.instance;
  }

  public async estimateFares(request: PricingRequest): Promise<PricingResponse> {
    const cacheKey = JSON.stringify(request);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.response;
    }

    try {
      const { data: response, error } = await supabase.functions.invoke(
        "passenger-pricing-estimate",
        { body: request },
      );

      if (error) {
        throw new Error(error.message || "pricing_service_unavailable");
      }

      const pricingResponse = parsePricingResponse(response);
      this.cache.set(cacheKey, { response: pricingResponse, timestamp: Date.now() });
      return pricingResponse;
    } catch (error: unknown) {
      console.error("[PricingService] Error estimating fares via backend:", error);
      throw error;
    }
  }
}

export const pricingService = PricingService.getInstance();
