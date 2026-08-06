import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";
import { calculateServerFare } from "../_shared/pricing.ts";

type PricingInput = {
  distanceMeters?: unknown;
  durationSeconds?: unknown;
  categoryIds?: unknown;
  stops?: unknown;
  serviceDetails?: unknown;
  city?: unknown;
};

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
    const token = (req.headers.get("Authorization") ?? "")
      .replace(/^Bearer\s+/i, "")
      .trim();
    if (!token) return json({ error: "unauthorized" }, 401, req);

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !serviceRole) return json({ error: "server_configuration_missing" }, 500, req);

    const admin = createClient(url, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) {
      return json({ error: "unauthorized", detail: authError?.message }, 401, req);
    }

    const input = (await req.json()) as PricingInput;
    const distanceMeters = finitePositive(input.distanceMeters);
    const durationSeconds = finitePositive(input.durationSeconds);
    if (!distanceMeters || !durationSeconds) {
      return json({ error: "invalid_route_metrics" }, 422, req);
    }

    const requestedIds = Array.isArray(input.categoryIds)
      ? input.categoryIds.filter((value): value is string => typeof value === "string")
      : [];
    const stopCount = Array.isArray(input.stops) ? Math.min(3, input.stops.length) : 0;
    const serviceDetails = sanitizeRecord(input.serviceDetails);
    const city = typeof input.city === "string" && input.city.trim() ? input.city.trim() : "default";

    let categoriesQuery = admin
      .from("ride_categories")
      .select("id,code,name")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (requestedIds.length) categoriesQuery = categoriesQuery.in("id", requestedIds);

    const { data: categories, error: categoryError } = await categoriesQuery;
    if (categoryError) {
      return json({ error: "category_lookup_failed", detail: categoryError.message }, 500, req);
    }

    const categoryIds = (categories ?? []).map((category) => category.id);
    const { data: rules, error: ruleError } = categoryIds.length
      ? await admin
          .from("tariff_rules")
          .select(
            "category_id,city,base_fare,min_fare,per_km,per_min,stop_fee,fixed_fee,dynamic_multiplier,is_active,valid_from,valid_to",
          )
          .in("category_id", categoryIds)
          .eq("is_active", true)
          .in("city", [city, "default"])
      : { data: [], error: null };

    if (ruleError) {
      return json({ error: "tariff_lookup_failed", detail: ruleError.message }, 500, req);
    }

    const now = Date.now();
    const estimates = (categories ?? []).map((category) => {
      const categoryRules = (rules ?? [])
        .filter((rule) => rule.category_id === category.id)
        .filter((rule) => !rule.valid_from || new Date(rule.valid_from).getTime() <= now)
        .filter((rule) => !rule.valid_to || new Date(rule.valid_to).getTime() >= now)
        .sort((a, b) => {
          if (a.city === city && b.city !== city) return -1;
          if (b.city === city && a.city !== city) return 1;
          return 0;
        });

      const rule = categoryRules[0];
      if (!rule) {
        return {
          categoryId: category.id,
          category_key: category.code,
          available: false,
          estimatedPrice: 0,
          originalPrice: 0,
          minimumPriceApplied: false,
          pricingVersion: "canonical-v2",
          unavailableReason: "Categoria sem tarifa ativa para esta região.",
        };
      }

      const tariff = {
        base_fare: Number(rule.base_fare ?? 0),
        min_fare: Number(rule.min_fare ?? 0),
        per_km: Number(rule.per_km ?? 0),
        per_min: Number(rule.per_min ?? 0),
        stop_fee: Number(rule.stop_fee ?? 0),
        fixed_fee: Number(rule.fixed_fee ?? 0),
        dynamic_multiplier: Number(rule.dynamic_multiplier ?? 1),
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
          unavailableReason: error instanceof Error ? error.message : "Tarifa indisponível.",
        };
      }
    });

    return json({ ok: true, currency: "BRL", estimates }, 200, req);
  } catch (error) {
    console.error("[passenger-pricing-estimate] fatal", error);
    return json(
      {
        error: "internal_error",
        detail: error instanceof Error ? error.message : String(error),
      },
      500,
      req,
    );
  }
});
