import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";
import { calculateServerFare } from "../_shared/pricing.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const MAX_INTERMEDIATES = 3;
const SEARCH_TIMEOUT_SECONDS = 180;
const MIN_SCHEDULE_LEAD_MS = 15 * 60 * 1000;
const MAX_SCHEDULE_AHEAD_MS = 30 * 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORY_CODES = new Set(["carros", "motos", "fretes", "guincho", "envios"]);
const PAYMENT_CODES = new Set(["pix", "credit", "debit", "cash", "wallet"]);

type Point = { lat: number; lng: number };
type RideLocation = Point & {
  label?: string;
  address?: string;
  place_id?: string | null;
  source?: string;
  order?: number;
};
type RequestBody = {
  action?: "create" | "redispatch" | "dispatch_paid_pix";
  ride_id?: string;
  request_key?: string;
  origin?: RideLocation;
  origin_name?: string;
  destination?: RideLocation;
  destination_name?: string;
  intermediates?: RideLocation[];
  category?: string;
  client_estimated_price?: number;
  payment_method?: string;
  service_details?: Record<string, unknown> | null;
  scheduled_for?: string | null;
};
type RouteMetrics = { distanceKm: number; durationMin: number; encodedPolyline: string | null };
type Passenger = {
  id: string;
  blocked_at?: string | null;
  suspended_at?: string | null;
  suspended_until?: string | null;
  block_reason?: string | null;
  deleted_at?: string | null;
};
type DispatchResult = {
  ok?: boolean;
  action?: string;
  status?: string;
  offered?: number;
  remaining_candidates?: number;
  error?: string;
};

function json(body: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "content-type": "application/json" },
  });
}

function cleanText(value: unknown, maxLength = 500): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validPoint(value: unknown): value is Point {
  if (!value || typeof value !== "object") return false;
  const point = value as Point;
  return finiteNumber(point.lat) && finiteNumber(point.lng) &&
    point.lat >= -90 && point.lat <= 90 && point.lng >= -180 && point.lng <= 180;
}

function normalizeCategory(value: unknown): string {
  const normalized = cleanText(value, 30).toLowerCase();
  if (normalized === "carro" || normalized === "car") return "carros";
  if (normalized === "moto") return "motos";
  if (normalized === "delivery") return "envios";
  if (normalized === "moving") return "fretes";
  if (normalized === "tow") return "guincho";
  return normalized;
}

function normalizePayment(value: unknown): string {
  const normalized = cleanText(value, 40).toLowerCase();
  if (["money", "dinheiro"].includes(normalized)) return "cash";
  if (["card", "credit_card", "credito", "crédito"].includes(normalized)) return "credit";
  if (["debit_card", "debito", "débito"].includes(normalized)) return "debit";
  return normalized;
}

function sanitizeRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const encoded = JSON.stringify(value);
  if (encoded.length > 12_000) throw new Error("service_details_too_large");
  return JSON.parse(encoded) as Record<string, unknown>;
}

function sanitizeLocation(value: RideLocation, fallbackLabel: string): Record<string, unknown> {
  const label = cleanText(value.label || fallbackLabel, 200) || fallbackLabel;
  const address = cleanText(value.address || label, 500) || label;
  const placeId = cleanText(value.place_id, 300);
  return {
    lat: value.lat,
    lng: value.lng,
    label,
    address,
    ...(placeId ? { place_id: placeId } : {}),
    source: cleanText(value.source, 30) || "unknown",
  };
}

function parseDurationSeconds(value: unknown): number {
  const match = String(value ?? "").match(/^([0-9]+(?:\.[0-9]+)?)s$/);
  return match ? Math.round(Number(match[1])) : 0;
}

async function calculateRoute(origin: Point, destination: Point, intermediates: Point[]): Promise<RouteMetrics> {
  const mapsKey = (
    Deno.env.get("GOOGLE_MAPS_PLATFORM_API_KEY") ||
    Deno.env.get("GOOGLE_ROUTES_API_KEY") ||
    Deno.env.get("GOOGLE_MAPS_API_KEY") ||
    ""
  ).trim();
  if (!mapsKey) throw new Error("google_routes_key_missing");

  const response = await fetch(GOOGLE_ROUTES_URL, {
    method: "POST",
    headers: {
      "X-Goog-Api-Key": mapsKey,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
      intermediates: intermediates.map((point) => ({
        location: { latLng: { latitude: point.lat, longitude: point.lng } },
      })),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      languageCode: "pt-BR",
      regionCode: "BR",
    }),
  });
  const responseText = await response.text();
  if (!response.ok) {
    console.error("[passenger-ride-request] Google Routes failed", response.status, responseText.slice(0, 300));
    throw new Error("route_calculation_failed");
  }
  const payload = JSON.parse(responseText) as {
    routes?: Array<{
      distanceMeters?: number;
      duration?: string;
      polyline?: { encodedPolyline?: string };
    }>;
  };
  const route = payload.routes?.[0];
  const distanceMeters = Number(route?.distanceMeters ?? 0);
  const durationSeconds = parseDurationSeconds(route?.duration);
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0 || durationSeconds <= 0) {
    throw new Error("route_calculation_failed");
  }
  return {
    distanceKm: Math.round((distanceMeters / 1000) * 100) / 100,
    durationMin: Math.max(1, Math.ceil(durationSeconds / 60)),
    encodedPolyline: cleanText(route?.polyline?.encodedPolyline, 100_000) || null,
  };
}

async function resolvePassenger(
  admin: ReturnType<typeof createClient>,
  authUserId: string,
): Promise<Passenger | null> {
  const { data, error } = await admin
    .from("users")
    .select("id,blocked_at,suspended_at,suspended_until,block_reason,deleted_at")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw new Error(`passenger_lookup_failed:${error.message}`);
  return (data as Passenger | null) ?? null;
}

async function loadTariff(
  admin: ReturnType<typeof createClient>,
  categoryId: string,
): Promise<Record<string, number> | null> {
  const fields = [
    "base_fare", "min_fare", "per_km", "per_min", "stop_fee", "fixed_fee", "dynamic_multiplier",
    "helper1_fee", "helper2_fee", "heavy_furniture_fee", "assembly_fee", "packing_fee",
    "difficult_access_fee", "stair_fee", "heavy_vehicle_fee", "accident_fee", "platform_fee",
    "locked_wheels_fee", "garage_fee", "max_weight_kg", "per_kg",
  ].join(",");
  const { data, error } = await admin
    .from("tariff_rules")
    .select(`category_id,city,${fields},valid_from,valid_to`)
    .eq("category_id", categoryId)
    .eq("is_active", true)
    .in("city", ["default"]);
  if (error) throw new Error(`tariff_lookup_failed:${error.message}`);
  const now = Date.now();
  const rule = (data ?? []).find((row) =>
    (!row.valid_from || new Date(row.valid_from).getTime() <= now) &&
    (!row.valid_to || new Date(row.valid_to).getTime() >= now)
  );
  if (!rule) return null;
  return Object.fromEntries(
    fields.split(",").map((field) => [field, Number((rule as Record<string, unknown>)[field] ?? 0)]),
  );
}

async function triggerCanonicalDispatch(
  rideId: string,
  mode: "initial" | "redispatch" = "initial",
): Promise<DispatchResult> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/dispatch-ride`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
      "content-type": "application/json",
    },
    body: JSON.stringify({ ride_id: rideId, mode }),
  });
  const payload = await response.json().catch(() => ({})) as DispatchResult;
  if (!response.ok) {
    throw new Error(`canonical_dispatch_failed:${response.status}:${cleanText(payload.error, 80) || "unknown"}`);
  }
  return payload;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, req);

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return json({ error: "server_configuration_missing" }, 500, req);
    }
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "unauthorized" }, 401, req);

    let body: RequestBody;
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      return json({ error: "invalid_json" }, 400, req);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (body.action === "dispatch_paid_pix") {
      if (token !== SERVICE_ROLE) return json({ error: "service_role_required" }, 403, req);
      const rideId = cleanText(body.ride_id, 50);
      if (!UUID_PATTERN.test(rideId)) return json({ error: "invalid_ride_id" }, 422, req);

      const { data: ride, error: rideError } = await admin
        .from("rides")
        .select("id,status,driver_id,accepted_driver_id,payment_method,payment_status,dispatch_attempts,candidate_driver_ids")
        .eq("id", rideId)
        .maybeSingle();
      if (rideError) return json({ error: "ride_lookup_failed" }, 500, req);
      if (!ride) return json({ error: "ride_not_found" }, 404, req);
      if (ride.payment_method !== "pix" || ride.payment_status !== "paid") {
        return json({ error: "pix_payment_not_confirmed" }, 409, req);
      }
      if (ride.status !== "procurar_motorista" || ride.driver_id || ride.accepted_driver_id) {
        return json({ ok: true, reused: true, status: ride.status, candidates: 0 }, 200, req);
      }

      const { data: claimed, error: claimError } = await admin.rpc("claim_prepaid_pix_initial_dispatch", {
        _ride_id: ride.id,
      });
      if (claimError) throw claimError;
      if (!claimed) {
        return json({
          ok: true,
          reused: true,
          status: ride.status,
          candidates: Number(ride.dispatch_attempts ?? 0) > 0
            ? (ride.candidate_driver_ids?.length ?? 0)
            : 0,
        }, 200, req);
      }

      const dispatchResult = await triggerCanonicalDispatch(ride.id, "initial");
      return json({
        ok: true,
        rideId: ride.id,
        status: dispatchResult.status ?? ride.status,
        candidates: Number(dispatchResult.offered ?? 0),
        dispatch_action: dispatchResult.action ?? null,
      }, 200, req);
    }

    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const authUserId = authData.user?.id;
    if (authError || !authUserId) return json({ error: "unauthorized" }, 401, req);

    const passenger = await resolvePassenger(admin, authUserId);
    if (!passenger || passenger.deleted_at) return json({ error: "passenger_profile_missing" }, 403, req);
    if (passenger.blocked_at) {
      return json({ error: "passenger_blocked", reason: passenger.block_reason }, 403, req);
    }
    const suspendedUntil = passenger.suspended_until || passenger.suspended_at;
    if (suspendedUntil && new Date(suspendedUntil).getTime() > Date.now()) {
      return json({ error: "passenger_suspended", suspended_until: suspendedUntil }, 403, req);
    }

    const { data: wallet, error: walletError } = await admin
      .from("passenger_wallets")
      .select("balance,is_blocked,blocked_reason")
      .eq("passenger_id", passenger.id)
      .maybeSingle();
    if (walletError) return json({ error: "wallet_status_failed" }, 500, req);
    if (wallet?.is_blocked) {
      return json({ error: "passenger_debt_block", reason: wallet.blocked_reason }, 403, req);
    }

    if (body.action === "redispatch") {
      const rideId = cleanText(body.ride_id, 50);
      if (!UUID_PATTERN.test(rideId)) return json({ error: "invalid_ride_id" }, 422, req);
      const { data: ride, error: rideError } = await admin
        .from("rides")
        .select("id,status,driver_id,accepted_driver_id,payment_method,payment_status")
        .eq("id", rideId)
        .eq("passenger_id", passenger.id)
        .maybeSingle();
      if (rideError) return json({ error: "ride_lookup_failed" }, 500, req);
      if (!ride) return json({ error: "ride_not_found" }, 404, req);
      if (ride.payment_method === "pix" && ride.payment_status !== "paid") {
        return json({ error: "pix_payment_required_before_dispatch" }, 409, req);
      }
      if (ride.status !== "procurar_motorista" || ride.driver_id || ride.accepted_driver_id) {
        return json({ ok: true, status: ride.status, candidates: 0 }, 200, req);
      }

      const dispatchResult = await triggerCanonicalDispatch(ride.id, "redispatch");
      return json({
        ok: true,
        rideId: ride.id,
        status: dispatchResult.status ?? ride.status,
        candidates: Number(dispatchResult.offered ?? 0),
        dispatch_action: dispatchResult.action ?? null,
        expired: dispatchResult.action === "expired",
      }, 200, req);
    }

    const requestKey = cleanText(body.request_key, 50);
    if (!UUID_PATTERN.test(requestKey)) return json({ error: "invalid_request_key" }, 422, req);
    if (!body.origin || !validPoint(body.origin) || !body.destination || !validPoint(body.destination)) {
      return json({ error: "invalid_coordinates" }, 422, req);
    }

    const intermediates = Array.isArray(body.intermediates) ? body.intermediates : [];
    if (intermediates.length > MAX_INTERMEDIATES || intermediates.some((point) => !validPoint(point))) {
      return json({ error: "invalid_intermediates" }, 422, req);
    }

    const categoryCode = normalizeCategory(body.category);
    if (!CATEGORY_CODES.has(categoryCode)) return json({ error: "invalid_category" }, 422, req);
    const paymentCode = normalizePayment(body.payment_method);
    if (!PAYMENT_CODES.has(paymentCode)) return json({ error: "payment_method_required" }, 422, req);

    const originName = cleanText(body.origin_name || body.origin.label, 200);
    const destinationName = cleanText(body.destination_name || body.destination.label, 200);
    if (!originName || !destinationName) return json({ error: "missing_address" }, 422, req);

    let serviceDetails: Record<string, unknown> | null;
    try {
      serviceDetails = sanitizeRecord(body.service_details);
    } catch {
      return json({ error: "invalid_service_details" }, 422, req);
    }

    const { data: existing } = await admin
      .from("rides")
      .select("id,status,estimated_price,scheduled_for,payment_status,payment_method")
      .eq("passenger_id", passenger.id)
      .eq("request_key", requestKey)
      .maybeSingle();
    if (existing) {
      return json({
        ok: true,
        reused: true,
        rideId: existing.id,
        status: existing.status,
        estimated_price: existing.estimated_price,
        scheduled_for: existing.scheduled_for,
        payment_required: existing.payment_method === "pix" && existing.payment_status !== "paid",
        payment_status: existing.payment_status,
      }, 200, req);
    }

    const { data: activeRide } = await admin
      .from("rides")
      .select("id,status,estimated_price,scheduled_for,payment_status,payment_method")
      .eq("passenger_id", passenger.id)
      .in("status", [
        "aguardando_pagamento",
        "procurar_motorista",
        "motorista_a_caminho",
        "motorista_chegou",
        "em_viagem",
      ])
      .limit(1)
      .maybeSingle();
    if (activeRide) {
      return json({
        ok: true,
        reused: true,
        rideId: activeRide.id,
        status: activeRide.status,
        estimated_price: activeRide.estimated_price,
        payment_required: activeRide.payment_method === "pix" && activeRide.payment_status !== "paid",
        payment_status: activeRide.payment_status,
      }, 200, req);
    }

    const { data: category, error: categoryError } = await admin
      .from("ride_categories")
      .select("id,code")
      .eq("code", categoryCode)
      .eq("is_active", true)
      .maybeSingle();
    if (categoryError || !category) return json({ error: "category_unavailable" }, 422, req);

    const { data: paymentMethod, error: paymentError } = await admin
      .from("payment_methods")
      .select("code,requires_balance")
      .eq("code", paymentCode)
      .eq("is_active", true)
      .maybeSingle();
    if (paymentError || !paymentMethod) return json({ error: "payment_method_unavailable" }, 422, req);

    let routeMetrics: RouteMetrics;
    try {
      routeMetrics = await calculateRoute(body.origin, body.destination, intermediates);
    } catch (error) {
      const code = error instanceof Error ? error.message : "route_calculation_failed";
      return json(
        { error: code === "google_routes_key_missing" ? "route_configuration_missing" : "route_calculation_failed" },
        code === "google_routes_key_missing" ? 503 : 502,
        req,
      );
    }

    const tariff = await loadTariff(admin, category.id);
    if (!tariff) return json({ error: "tariff_unavailable" }, 422, req);
    const fare = calculateServerFare({
      category: categoryCode,
      distanceKm: routeMetrics.distanceKm,
      durationMin: routeMetrics.durationMin,
      tariff,
      stopCount: intermediates.length,
      serviceDetails,
    });

    if ((paymentMethod.requires_balance || paymentCode === "wallet") && Number(wallet?.balance ?? 0) < fare.total) {
      return json({
        error: "insufficient_balance",
        required: fare.total,
        balance: Number(wallet?.balance ?? 0),
      }, 422, req);
    }

    const nowMs = Date.now();
    let scheduledFor: Date | null = null;
    if (body.scheduled_for) {
      scheduledFor = new Date(body.scheduled_for);
      if (!Number.isFinite(scheduledFor.getTime())) return json({ error: "invalid_scheduled_for" }, 422, req);
      const scheduledAtMs = scheduledFor.getTime();
      if (scheduledAtMs < nowMs + MIN_SCHEDULE_LEAD_MS) {
        return json({ error: "scheduled_too_soon", minimum_lead_minutes: 15 }, 422, req);
      }
      if (scheduledAtMs > nowMs + MAX_SCHEDULE_AHEAD_MS) {
        return json({ error: "scheduled_too_far", maximum_days: 30 }, 422, req);
      }
    }
    const isScheduled = scheduledFor !== null;
    if (isScheduled && paymentCode === "pix") {
      return json({ error: "scheduled_pix_requires_business_rule" }, 409, req);
    }

    const origin = sanitizeLocation(body.origin, originName);
    const destination = sanitizeLocation(body.destination, destinationName);
    const persistedIntermediates = intermediates.map((point, index) => ({
      ...sanitizeLocation(point, `Parada ${index + 1}`),
      order: index,
    }));
    const isPrepaidPix = paymentCode === "pix" && !isScheduled;
    const initialStatus = isScheduled
      ? "agendada"
      : isPrepaidPix
      ? "aguardando_pagamento"
      : "procurar_motorista";

    const { data: ride, error: insertError } = await admin
      .from("rides")
      .insert({
        passenger_id: passenger.id,
        category: categoryCode,
        status: initialStatus,
        origin,
        destination,
        intermediates: persistedIntermediates,
        origin_name: originName,
        destination_name: destinationName,
        origin_lat: body.origin.lat,
        origin_lng: body.origin.lng,
        destination_lat: body.destination.lat,
        destination_lng: body.destination.lng,
        encoded_polyline: routeMetrics.encodedPolyline,
        distance_km: routeMetrics.distanceKm,
        duration_min: routeMetrics.durationMin,
        estimated_price: fare.total,
        payment_method: paymentCode,
        payment_status: isPrepaidPix ? "pending" : null,
        payment_provider: isPrepaidPix ? "asaas" : null,
        request_key: requestKey,
        scheduled_for: scheduledFor?.toISOString() ?? null,
        pickup_label: cleanText(body.origin.label, 200) || originName,
        pickup_short_label: originName,
        pickup_address: cleanText(body.origin.address, 500) || originName,
        pickup_place_id: cleanText(body.origin.place_id, 300) || null,
        pickup_source: cleanText(body.origin.source, 30) || "gps",
        search_expires_at: initialStatus === "procurar_motorista"
          ? new Date(nowMs + SEARCH_TIMEOUT_SECONDS * 1000).toISOString()
          : null,
        service_details: {
          ...(serviceDetails ?? {}),
          pricing_breakdown: {
            base: fare.base,
            extras: fare.extras,
            total: fare.total,
            pricing_version: "canonical-v2",
            calculated_at: new Date().toISOString(),
          },
          client_estimated_price: finiteNumber(body.client_estimated_price)
            ? body.client_estimated_price
            : null,
        },
      })
      .select("*")
      .single();

    if (insertError?.code === "23505") {
      const { data: duplicate } = await admin
        .from("rides")
        .select("id,status,estimated_price,scheduled_for,payment_status,payment_method")
        .eq("passenger_id", passenger.id)
        .in("status", [
          "aguardando_pagamento",
          "procurar_motorista",
          "motorista_a_caminho",
          "motorista_chegou",
          "em_viagem",
        ])
        .limit(1)
        .maybeSingle();
      if (duplicate) {
        return json({
          ok: true,
          reused: true,
          rideId: duplicate.id,
          status: duplicate.status,
          estimated_price: duplicate.estimated_price,
          payment_required: duplicate.payment_method === "pix" && duplicate.payment_status !== "paid",
          payment_status: duplicate.payment_status,
        }, 200, req);
      }
    }
    if (insertError || !ride) {
      return json({ error: "ride_insert_failed", detail: insertError?.message }, 500, req);
    }

    let dispatchAction: string | null = null;
    let candidateCount = 0;
    if (initialStatus === "procurar_motorista") {
      try {
        const dispatchResult = await triggerCanonicalDispatch(ride.id, "initial");
        dispatchAction = dispatchResult.action ?? null;
        candidateCount = Number(dispatchResult.offered ?? 0);
      } catch (error) {
        console.error("[passenger-ride-request] canonical dispatch failed", error);
      }
    }

    return json({
      ok: true,
      rideId: ride.id,
      status: ride.status,
      candidates: candidateCount,
      dispatch_action: dispatchAction,
      estimated_price: fare.total,
      scheduled_for: scheduledFor?.toISOString() ?? null,
      payment_required: isPrepaidPix,
      payment_status: ride.payment_status,
    }, 200, req);
  } catch (error) {
    console.error("[passenger-ride-request] fatal", error);
    return json({
      error: "internal_error",
      detail: error instanceof Error ? error.message.slice(0, 200) : undefined,
    }, 500, req);
  }
});
