import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";
import { calculateServerFare } from "../_shared/pricing.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const MAX_INTERMEDIATES = 3;
const SEARCH_TIMEOUT_SECONDS = 180;
const OFFER_TIMEOUT_SECONDS = 60;
const MAX_GPS_AGE_SECONDS = 120;
const DISPATCH_RADII_KM = [3, 5, 8, 12, 20, 30, 50];
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CATEGORY_CODES = new Set(["carros", "motos", "fretes", "guincho", "envios"]);

type RideAction = "create" | "redispatch";
type Point = { lat: number; lng: number };
type RideLocation = Point & {
  label?: string;
  address?: string;
  place_id?: string | null;
  source?: string;
  order?: number;
};

type RequestBody = {
  action?: RideAction;
  ride_id?: string;
  request_key?: string;
  origin?: RideLocation;
  origin_name?: string;
  destination?: RideLocation;
  destination_name?: string;
  intermediates?: RideLocation[];
  category?: string;
  distance_km?: number;
  duration_min?: number;
  encoded_polyline?: string | null;
  client_estimated_price?: number;
  payment_method?: string;
  service_details?: Record<string, unknown> | null;
  scheduled_for?: string | null;
};

type RouteMetrics = {
  distanceKm: number;
  durationMin: number;
  encodedPolyline: string | null;
};

type PublicPassenger = {
  id: string;
  auth_user_id?: string | null;
  blocked_at?: string | null;
  suspended_at?: string | null;
  suspended_until?: string | null;
  block_reason?: string | null;
};

function json(body: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "content-type": "application/json" },
  });
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validPoint(value: unknown): value is Point {
  if (!value || typeof value !== "object") return false;
  const point = value as Point;
  return (
    finiteNumber(point.lat) &&
    finiteNumber(point.lng) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lng >= -180 &&
    point.lng <= 180
  );
}

function cleanText(value: unknown, maxLength = 500): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeCategory(value: unknown): string {
  const normalized = cleanText(value, 30).toLowerCase();
  if (normalized === "carro") return "carros";
  if (normalized === "moto") return "motos";
  return normalized;
}

function normalizePaymentMethod(value: unknown): string {
  const normalized = cleanText(value, 40).toLowerCase();
  if (["cash", "dinheiro"].includes(normalized)) return "money";
  if (["card", "credit", "credito"].includes(normalized)) return "credit_card";
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
  const source = cleanText(value.source, 30) || "unknown";

  return {
    lat: value.lat,
    lng: value.lng,
    label,
    address,
    ...(placeId ? { place_id: placeId } : {}),
    source,
  };
}

function distanceKm(a: Point, b: Point): number {
  const radius = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const value =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinLng *
      sinLng;
  return 2 * radius * Math.asin(Math.sqrt(value));
}

function parseDurationSeconds(value: unknown): number {
  const match = String(value ?? "").match(/^([0-9]+(?:\.[0-9]+)?)s$/);
  return match ? Math.round(Number(match[1])) : 0;
}

async function calculateRoute(
  origin: Point,
  destination: Point,
  intermediates: Point[],
): Promise<RouteMetrics> {
  const mapsKey = Deno.env.get("GOOGLE_MAPS_PLATFORM_API_KEY")?.trim() ?? "";
  if (!mapsKey) throw new Error("google_routes_key_missing");

  const response = await fetch(GOOGLE_ROUTES_URL, {
    method: "POST",
    headers: {
      "X-Goog-Api-Key": mapsKey,
      "X-Goog-FieldMask":
        "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      origin: {
        location: { latLng: { latitude: origin.lat, longitude: origin.lng } },
      },
      destination: {
        location: { latLng: { latitude: destination.lat, longitude: destination.lng } },
      },
      intermediates: intermediates.map((point) => ({
        location: { latLng: { latitude: point.lat, longitude: point.lng } },
      })),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      languageCode: "pt-BR",
      regionCode: "BR",
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    console.error("[passenger-ride-request] Google Routes failed", {
      status: response.status,
      detail: text.slice(0, 300),
    });
    throw new Error("route_calculation_failed");
  }

  const payload = JSON.parse(text) as {
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

async function resolvePassenger(admin: any, authUserId: string): Promise<PublicPassenger | null> {
  const { data, error } = await admin
    .from("users")
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) throw new Error(`passenger_lookup_failed:${error.message}`);
  if (data) return data as PublicPassenger;

  const { data: legacy, error: legacyError } = await admin
    .from("users")
    .select("*")
    .eq("id", authUserId)
    .maybeSingle();
  if (legacyError) throw new Error(`passenger_lookup_failed:${legacyError.message}`);
  return (legacy as PublicPassenger | null) ?? null;
}

async function loadTariff(
  admin: any,
  categoryId: string,
  city = "default",
): Promise<Record<string, number> | null> {
  const { data, error } = await admin
    .from("tariff_rules")
    .select(
      "category_id,city,base_fare,min_fare,per_km,per_min,stop_fee,fixed_fee,dynamic_multiplier,valid_from,valid_to",
    )
    .eq("category_id", categoryId)
    .eq("is_active", true)
    .in("city", [city, "default"]);

  if (error) throw new Error(`tariff_lookup_failed:${error.message}`);
  const now = Date.now();
  const rule = (data ?? [])
    .filter((row: any) => !row.valid_from || new Date(row.valid_from).getTime() <= now)
    .filter((row: any) => !row.valid_to || new Date(row.valid_to).getTime() >= now)
    .sort((a: any, b: any) => {
      if (a.city === city && b.city !== city) return -1;
      if (b.city === city && a.city !== city) return 1;
      return 0;
    })[0];

  if (!rule) return null;
  return {
    base_fare: Number(rule.base_fare ?? 0),
    min_fare: Number(rule.min_fare ?? 0),
    per_km: Number(rule.per_km ?? 0),
    per_min: Number(rule.per_min ?? 0),
    stop_fee: Number(rule.stop_fee ?? 0),
    fixed_fee: Number(rule.fixed_fee ?? 0),
    dynamic_multiplier: Number(rule.dynamic_multiplier ?? 1),
  };
}

async function notifyCandidates(ride: any, userIds: string[]): Promise<void> {
  if (!userIds.length) return;

  const response = await fetch(`${SUPABASE_URL}/functions/v1/send-ride-push`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      user_ids: userIds,
      event: "driver.new_ride_request",
      title: "APOIS • Nova corrida disponível",
      body: `${ride.origin_name} → ${ride.destination_name}`,
      url: "/motorista/app",
      ride_id: ride.id,
    }),
  });

  if (!response.ok) {
    console.error("[passenger-ride-request] push failed", {
      status: response.status,
      detail: (await response.text()).slice(0, 300),
    });
  }
}

async function dispatch(admin: any, ride: any): Promise<string[]> {
  const rejected = new Set<string>(
    Array.isArray(ride.rejected_driver_ids) ? ride.rejected_driver_ids.map(String) : [],
  );

  const { data: drivers, error: driverError } = await admin
    .from("drivers")
    .select(
      "id,user_id,category,is_online,approval_status,subscription_status,current_lat,current_lng,last_location_at",
    )
    .eq("is_online", true)
    .eq("approval_status", "aprovado");

  if (driverError) throw new Error(`driver_lookup_failed:${driverError.message}`);

  const { data: assigned, error: assignedError } = await admin
    .from("rides")
    .select("driver_id")
    .in("status", ["motorista_a_caminho", "motorista_chegou", "em_viagem"])
    .not("driver_id", "is", null);
  if (assignedError) throw new Error(`active_driver_lookup_failed:${assignedError.message}`);

  const busyDriverIds = new Set((assigned ?? []).map((row: any) => String(row.driver_id)));
  const origin = { lat: Number(ride.origin_lat), lng: Number(ride.origin_lng) };
  const category = normalizeCategory(ride.category);
  const now = Date.now();

  const eligible = (drivers ?? [])
    .filter((driver: any) => {
      const driverUserId = String(driver.user_id ?? "");
      if (!driverUserId || rejected.has(driverUserId) || busyDriverIds.has(driverUserId)) return false;
      if (normalizeCategory(driver.category) !== category) return false;
      if (!finiteNumber(Number(driver.current_lat)) || !finiteNumber(Number(driver.current_lng))) {
        return false;
      }
      if (driver.last_location_at) {
        const ageSeconds = (now - new Date(driver.last_location_at).getTime()) / 1000;
        if (!Number.isFinite(ageSeconds) || ageSeconds > MAX_GPS_AGE_SECONDS) return false;
      }
      const subscriptionStatus = cleanText(driver.subscription_status, 30).toLowerCase();
      return ["ativa", "teste", "active"].includes(subscriptionStatus);
    })
    .map((driver: any) => {
      const point = { lat: Number(driver.current_lat), lng: Number(driver.current_lng) };
      return { userId: String(driver.user_id), distance: distanceKm(origin, point) };
    })
    .sort((a: { distance: number }, b: { distance: number }) => a.distance - b.distance);

  let selected: Array<{ userId: string; distance: number }> = [];
  for (const radius of DISPATCH_RADII_KM) {
    selected = eligible.filter((driver: { distance: number }) => driver.distance <= radius);
    if (selected.length) break;
  }

  const candidateIds = selected.slice(0, 20).map((driver) => driver.userId);
  if (!candidateIds.length) return [];

  const { error: updateError } = await admin
    .from("rides")
    .update({
      candidate_driver_ids: candidateIds,
      offered_driver_ids: candidateIds,
      current_offer_driver_id: null,
      request_expires_at: new Date(Date.now() + OFFER_TIMEOUT_SECONDS * 1000).toISOString(),
      dispatch_attempts: Number(ride.dispatch_attempts ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ride.id)
    .eq("status", "procurar_motorista")
    .is("driver_id", null);

  if (updateError) throw new Error(`dispatch_update_failed:${updateError.message}`);
  return candidateIds;
}

async function handleRedispatch(
  admin: any,
  passengerId: string,
  body: RequestBody,
  req: Request,
): Promise<Response> {
  const rideId = cleanText(body.ride_id, 50);
  if (!UUID_PATTERN.test(rideId)) return json({ error: "invalid_ride_id" }, 422, req);

  const { data: ride, error } = await admin
    .from("rides")
    .select("*")
    .eq("id", rideId)
    .eq("passenger_id", passengerId)
    .maybeSingle();
  if (error) return json({ error: "ride_lookup_failed", detail: error.message }, 500, req);
  if (!ride) return json({ error: "ride_not_found" }, 404, req);
  if (ride.status !== "procurar_motorista" || ride.driver_id) {
    return json({ ok: true, skipped: "status_changed", status: ride.status, candidates: 0 }, 200, req);
  }

  const searchExpiresAt = ride.search_expires_at
    ? new Date(ride.search_expires_at).getTime()
    : new Date(ride.created_at).getTime() + SEARCH_TIMEOUT_SECONDS * 1000;

  if (searchExpiresAt <= Date.now()) {
    const { error: expirationError } = await admin
      .from("rides")
      .update({
        status: "cancelada_passageiro",
        cancellation_reason: "Nenhum motorista disponível no momento.",
        cancelled_by: "system",
        cancelled_at: new Date().toISOString(),
        candidate_driver_ids: [],
        offered_driver_ids: [],
        current_offer_driver_id: null,
      })
      .eq("id", ride.id)
      .eq("status", "procurar_motorista");
    if (expirationError) {
      return json({ error: "ride_expire_failed", detail: expirationError.message }, 500, req);
    }
    return json({ ok: true, status: "cancelada_passageiro", expired: true, candidates: 0 }, 200, req);
  }

  try {
    const candidateIds = await dispatch(admin, ride);
    EdgeRuntime.waitUntil(
      notifyCandidates(ride, candidateIds).catch((error) =>
        console.error("[passenger-ride-request] redispatch push failed", error),
      ),
    );
    return json(
      {
        ok: true,
        rideId: ride.id,
        status: ride.status,
        candidates: candidateIds.length,
      },
      200,
      req,
    );
  } catch (dispatchError) {
    console.error("[passenger-ride-request] redispatch failed", dispatchError);
    return json({ error: "redispatch_failed" }, 500, req);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, req);

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return json({ error: "server_configuration_missing" }, 500, req);
    }

    const token = (req.headers.get("Authorization") ?? "")
      .replace(/^Bearer\s+/i, "")
      .trim();
    if (!token) return json({ error: "unauthorized" }, 401, req);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const authUserId = authData.user?.id;
    if (authError || !authUserId) {
      return json({ error: "unauthorized", detail: authError?.message }, 401, req);
    }

    const passenger = await resolvePassenger(admin, authUserId);
    if (!passenger) return json({ error: "passenger_profile_missing" }, 403, req);
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
    if (walletError) {
      return json({ error: "wallet_status_failed", detail: walletError.message }, 500, req);
    }
    if (wallet?.is_blocked) {
      return json(
        {
          error: "passenger_debt_block",
          reason: wallet.blocked_reason,
          balance: wallet.balance,
        },
        403,
        req,
      );
    }

    const body = (await req.json()) as RequestBody;
    if (body.action === "redispatch") {
      return await handleRedispatch(admin, passenger.id, body, req);
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

    const paymentMethodCode = normalizePaymentMethod(body.payment_method);
    if (!paymentMethodCode) return json({ error: "payment_method_required" }, 422, req);

    const originName = cleanText(body.origin_name || body.origin.label, 200);
    const destinationName = cleanText(body.destination_name || body.destination.label, 200);
    if (!originName || !destinationName) return json({ error: "missing_address" }, 422, req);

    let serviceDetails: Record<string, unknown> | null;
    try {
      serviceDetails = sanitizeRecord(body.service_details);
    } catch {
      return json({ error: "invalid_service_details" }, 422, req);
    }

    const { data: existing, error: existingError } = await admin
      .from("rides")
      .select("id,status,estimated_price,scheduled_for")
      .eq("passenger_id", passenger.id)
      .eq("request_key", requestKey)
      .maybeSingle();
    if (existingError) {
      return json({ error: "idempotency_lookup_failed", detail: existingError.message }, 500, req);
    }
    if (existing) {
      return json(
        {
          ok: true,
          reused: true,
          rideId: existing.id,
          status: existing.status,
          estimated_price: existing.estimated_price,
          scheduled_for: existing.scheduled_for,
        },
        200,
        req,
      );
    }

    const { data: activeRide, error: activeError } = await admin
      .from("rides")
      .select("id,status,estimated_price,scheduled_for")
      .eq("passenger_id", passenger.id)
      .in("status", [
        "procurar_motorista",
        "motorista_a_caminho",
        "motorista_chegou",
        "em_viagem",
      ])
      .limit(1)
      .maybeSingle();
    if (activeError) {
      return json({ error: "active_ride_lookup_failed", detail: activeError.message }, 500, req);
    }
    if (activeRide) {
      return json(
        {
          ok: true,
          reused: true,
          rideId: activeRide.id,
          status: activeRide.status,
          estimated_price: activeRide.estimated_price,
          scheduled_for: activeRide.scheduled_for,
        },
        200,
        req,
      );
    }

    const { data: category, error: categoryError } = await admin
      .from("ride_categories")
      .select("id,code,name")
      .eq("code", categoryCode)
      .eq("is_active", true)
      .maybeSingle();
    if (categoryError) {
      return json({ error: "category_lookup_failed", detail: categoryError.message }, 500, req);
    }
    if (!category) return json({ error: "category_unavailable" }, 422, req);

    const { data: paymentMethod, error: paymentError } = await admin
      .from("payment_methods")
      .select("code,requires_balance")
      .eq("code", paymentMethodCode)
      .eq("is_active", true)
      .maybeSingle();
    if (paymentError) {
      return json({ error: "payment_method_lookup_failed", detail: paymentError.message }, 500, req);
    }
    if (!paymentMethod) return json({ error: "payment_method_unavailable" }, 422, req);

    let routeMetrics: RouteMetrics;
    try {
      routeMetrics = await calculateRoute(
        body.origin,
        body.destination,
        intermediates,
      );
    } catch (routeError) {
      console.error("[passenger-ride-request] route validation failed", routeError);
      return json({ error: "route_calculation_failed" }, 502, req);
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

    if (
      (paymentMethod.requires_balance || paymentMethodCode === "wallet") &&
      Number(wallet?.balance ?? 0) < fare.total
    ) {
      return json(
        {
          error: "insufficient_balance",
          required: fare.total,
          balance: Number(wallet?.balance ?? 0),
        },
        422,
        req,
      );
    }

    const origin = sanitizeLocation(body.origin, originName);
    const destination = sanitizeLocation(body.destination, destinationName);
    const persistedIntermediates = intermediates.map((point, index) => ({
      ...sanitizeLocation(point, `Parada ${index + 1}`),
      order: index,
    }));
    const persistedServiceDetails = {
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
    };

    const scheduledFor = body.scheduled_for ? new Date(body.scheduled_for) : null;
    if (scheduledFor && !Number.isFinite(scheduledFor.getTime())) {
      return json({ error: "invalid_scheduled_for" }, 422, req);
    }

    const now = new Date();
    const isScheduled = Boolean(scheduledFor && scheduledFor.getTime() > now.getTime());
    const { data: ride, error: insertError } = await admin
      .from("rides")
      .insert({
        passenger_id: passenger.id,
        category: categoryCode,
        status: isScheduled ? "agendada" : "procurar_motorista",
        origin,
        origin_name: originName,
        origin_lat: body.origin.lat,
        origin_lng: body.origin.lng,
        destination,
        destination_name: destinationName,
        destination_lat: body.destination.lat,
        destination_lng: body.destination.lng,
        intermediates: persistedIntermediates,
        distance_km: routeMetrics.distanceKm,
        duration_min: routeMetrics.durationMin,
        encoded_polyline: routeMetrics.encodedPolyline,
        estimated_price: fare.total,
        payment_method: paymentMethodCode,
        service_details: persistedServiceDetails,
        request_key: requestKey,
        scheduled_for: isScheduled ? scheduledFor?.toISOString() : null,
        pickup_label: cleanText(body.origin.label, 200) || originName,
        pickup_short_label: originName,
        pickup_address: cleanText(body.origin.address, 500) || originName,
        pickup_place_id: cleanText(body.origin.place_id, 300) || null,
        pickup_source: cleanText(body.origin.source, 30) || "gps",
        search_expires_at: isScheduled
          ? null
          : new Date(Date.now() + SEARCH_TIMEOUT_SECONDS * 1000).toISOString(),
      })
      .select("*")
      .single();

    if (insertError?.code === "23505") {
      const { data: duplicate } = await admin
        .from("rides")
        .select("id,status,estimated_price,scheduled_for")
        .eq("passenger_id", passenger.id)
        .eq("request_key", requestKey)
        .maybeSingle();
      if (duplicate) {
        return json(
          {
            ok: true,
            reused: true,
            rideId: duplicate.id,
            status: duplicate.status,
            estimated_price: duplicate.estimated_price,
            scheduled_for: duplicate.scheduled_for,
          },
          200,
          req,
        );
      }
    }
    if (insertError || !ride) {
      return json({ error: "ride_insert_failed", detail: insertError?.message }, 500, req);
    }

    let candidateIds: string[] = [];
    if (!isScheduled) {
      try {
        candidateIds = await dispatch(admin, ride);
        EdgeRuntime.waitUntil(
          notifyCandidates(ride, candidateIds).catch((error) =>
            console.error("[passenger-ride-request] initial push failed", error),
          ),
        );
      } catch (dispatchError) {
        console.error("[passenger-ride-request] dispatch failed", dispatchError);
      }
    }

    return json(
      {
        ok: true,
        rideId: ride.id,
        status: ride.status,
        candidates: candidateIds.length,
        estimated_price: fare.total,
        scheduled_for: isScheduled ? scheduledFor?.toISOString() : null,
      },
      200,
      req,
    );
  } catch (error) {
    console.error("[passenger-ride-request] fatal", error);
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
