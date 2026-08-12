import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";
import { calculateServerFare } from "../_shared/pricing.ts";
import {
  brlFromCents,
  calculateProcessingFeeCents,
  centsFromBrl,
  processingFeePolicyFromSettings,
} from "../_shared/payment-processing.ts";

type PricingInput = {
  distanceMeters?: unknown;
  durationSeconds?: unknown;
  categoryIds?: unknown;
  stops?: unknown;
  serviceDetails?: unknown;
  city?: unknown;
};

const TARIFF_COLUMNS = [
  "category_id",
  "city",
  "base_fare",
  "min_fare",
  "per_km",
  "per_min",
  "stop_fee",
  "fixed_fee",
  "dynamic_multiplier",
  "helper1_fee",
  "helper2_fee",
  "heavy_furniture_fee",
  "assembly_fee",
  "packing_fee",
  "difficult_access_fee",
  "stair_fee",
  "heavy_vehicle_fee",
  "accident_fee",
  "platform_fee",
  "locked_wheels_fee",
  "garage_fee",
  "max_weight_kg",
  "per_kg",
  "is_active",
  "valid_from",
  "valid_to",
].join(",");

const PROCESSING_SETTING_KEYS = [
  "finance.ride_processing_fee_enabled",
  "finance.ride_processing_fee_rate_bps",
  "finance.ride_processing_fee_min_cents",
  "finance.ride_processing_fee_max_cents",
];

function json(body: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "content-type": "application/json" },
  });
}

function finitePositive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function sanitizeRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const encoded = JSON.stringify(value);
  if (encoded.length > 12_000) throw new Error("service_details_too_large");
  return JSON.parse(encoded) as Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, req);

  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "unauthorized" }, 401, req);

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !serviceRole) return json({ error: "server_configuration_missing" }, 500, req);

    const admin = createClient(url, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "unauthorized" }, 401, req);

    const input = (await req.json()) as PricingInput;
    const distanceMeters = finitePositive(input.distanceMeters);
    const durationSeconds = finitePositive(input.durationSeconds);
    if (!distanceMeters || !durationSeconds) return json({ error: "invalid_route_metrics" }, 422, req);

    const requestedIds = Array.isArray(input.categoryIds)
      ? input.categoryIds.filter((value): value is string => typeof value === "string")
      : [];
    const stopCount = Array.isArray(input.stops) ? Math.min(3, input.stops.length) : 0;
    const serviceDetails = sanitizeRecord(input.serviceDetails);
    const city = typeof input.city === "string" && input.city.trim() ? input.city.trim() : "default";

    const { data: feeSettingRows, error: feeSettingError } = await admin
      .from("app_settings")
      .select("key,value")
      .in("key", PROCESSING_SETTING_KEYS);
    if (feeSettingError) return json({ error: "processing_fee_settings_failed" }, 500, req);
    const feeSettings = Object.fromEntries((feeSettingRows ?? []).map((row) => [row.key, row.value]));
    const processingFeePolicy = processingFeePolicyFromSettings(feeSettings);

    let categoriesQuery = admin
      .from("ride_categories")
      .select("id,code,name")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (requestedIds.length) categoriesQuery = categoriesQuery.in("id", requestedIds);

    const { data: categories, error: categoryError } = await categoriesQuery;
    if (categoryError) return json({ error: "category_lookup_failed" }, 500, req);

    const categoryIds = (categories ?? []).map((category) => category.id);
    const { data: rules, error: ruleError } = categoryIds.length
      ? await admin
          .from("tariff_rules")
          .select(TARIFF_COLUMNS)
          .in("category_id", categoryIds)
          .eq("is_active", true)
          .in("city", [city, "default"])
      : { data: [], error: null };

    if (ruleError) return json({ error: "tariff_lookup_failed" }, 500, req);

    const now = Date.now();
    const estimates = (categories ?? []).map((category) => {
      const rule = (rules ?? [])
        .filter((item) => item.category_id === category.id)
        .filter((item) => !item.valid_from || new Date(item.valid_from).getTime() <= now)
        .filter((item) => !item.valid_to || new Date(item.valid_to).getTime() >= now)
        .sort((a, b) => {
          if (a.city === city && b.city !== city) return -1;
          if (b.city === city && a.city !== city) return 1;
          return 0;
        })[0];

      if (!rule) {
        return {
          categoryId: category.id,
          category_key: category.code,
          available: false,
          estimatedPrice: 0,
          originalPrice: 0,
          minimumPriceApplied: false,
          pricingVersion: "canonical-v2",
          pixProcessingFee: 0,
          pixPassengerTotal: 0,
          unavailableReason: "Categoria sem tarifa ativa para esta região.",
        };
      }

      const tariff: Record<string, number> = {
        base_fare: Number(rule.base_fare ?? 0),
        min_fare: Number(rule.min_fare ?? 0),
        per_km: Number(rule.per_km ?? 0),
        per_min: Number(rule.per_min ?? 0),
        stop_fee: Number(rule.stop_fee ?? 0),
        fixed_fee: Number(rule.fixed_fee ?? 0),
        dynamic_multiplier: Number(rule.dynamic_multiplier ?? 1),
        helper1_fee: Number(rule.helper1_fee ?? 0),
        helper2_fee: Number(rule.helper2_fee ?? 0),
        heavy_furniture_fee: Number(rule.heavy_furniture_fee ?? 0),
        assembly_fee: Number(rule.assembly_fee ?? 0),
        packing_fee: Number(rule.packing_fee ?? 0),
        difficult_access_fee: Number(rule.difficult_access_fee ?? 0),
        stair_fee: Number(rule.stair_fee ?? 0),
        heavy_vehicle_fee: Number(rule.heavy_vehicle_fee ?? 0),
        accident_fee: Number(rule.accident_fee ?? 0),
        platform_fee: Number(rule.platform_fee ?? 0),
        locked_wheels_fee: Number(rule.locked_wheels_fee ?? 0),
        garage_fee: Number(rule.garage_fee ?? 0),
        max_weight_kg: Number(rule.max_weight_kg ?? 0),
        per_kg: Number(rule.per_kg ?? 0),
      };

      try {
        const breakdown = calculateServerFare({
          category: category.code,
          distanceKm: distanceMeters / 1000,
          durationMin: durationSeconds / 60,
          tariff,
          stopCount,
          serviceDetails,
        });
        const fareCents = centsFromBrl(breakdown.total);
        const pixProcessingFeeCents = calculateProcessingFeeCents(fareCents, processingFeePolicy);
        const pixPassengerTotalCents = fareCents + pixProcessingFeeCents;

        return {
          categoryId: category.id,
          category_key: category.code,
          available: true,
          estimatedPrice: breakdown.total,
          total: breakdown.total,
          originalPrice: breakdown.total,
          minimumPriceApplied: breakdown.base === tariff.min_fare,
          pricingVersion: "canonical-v2",
          extrasTotal: Object.values(breakdown.extras).reduce((sum, value) => sum + value, 0),
          base_fare: breakdown.base,
          pixProcessingFee: brlFromCents(pixProcessingFeeCents),
          pixPassengerTotal: brlFromCents(pixPassengerTotalCents),
        };
      } catch (error) {
        return {
          categoryId: category.id,
          category_key: category.code,
          available: false,
          estimatedPrice: 0,
          originalPrice: 0,
          minimumPriceApplied: false,
          pricingVersion: "canonical-v2",
          pixProcessingFee: 0,
          pixPassengerTotal: 0,
          unavailableReason: error instanceof Error ? error.message : "Tarifa indisponível.",
        };
      }
    });

    return json({ ok: true, currency: "BRL", estimates }, 200, req);
  } catch (error) {
    console.error("[passenger-pricing-estimate] fatal", error);
    return json(
      { error: "internal_error", detail: error instanceof Error ? error.message : String(error) },
      500,
      req,
    );
  }
});
