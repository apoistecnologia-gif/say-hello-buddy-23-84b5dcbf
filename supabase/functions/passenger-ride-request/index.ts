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
  action?: "create" | "redispatch";
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
  return finiteNumber(point.lat) && finiteNumber(point.lng) && point.lat >= -90 && point.lat <= 90 && point.lng >= -180 && point.lng <= 180;
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

function haversineKm(a: Point, b: Point): number {
  const radius = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const value = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(value));
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
      intermediates: intermediates.map((point) => ({ location: { latLng: { latitude: point.lat, longitude: point.lng } } })),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      languageCode: "pt-BR",
      regionCode: "BR",
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    console.error("[passenger-ride-request] Google Routes failed", response.status, text.slice(0, 300));
    throw new Error("route_calculation_failed");
  }

  const payload = JSON.parse(text) as { routes?: Array<{ distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string } }> };
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

async function resolvePassenger(admin: ReturnType<typeof createClient>, authUserId: string): Promise<Passenger | null> {
  const { data, error } = await admin
    .from("users")
    .select("id,blocked_at,suspended_at,suspended_until,block_reason,deleted_at")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw new Error(`passenger_lookup_failed:${error.message}`);
  return (data as Passenger | null) ?? null;
}

async function loadTariff(admin: ReturnType<typeof createClient>, categoryId: string): Promise<Record<string, number> | null> {
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
  const rule = (data ?? []).find((row) => (!row.valid_from || new Date(row.valid_from).getTime() <= now) && (!row.valid_to || new Date(row.valid_to).getTime() >= now));
  if (!rule) return null;
  return Object.fromEntries(fields.split(",").map((field) => [field, Number((rule as Record<string, unknown>)[field] ?? 0)]));
}

async function notifyCandidates(ride: Record<string, unknown>, userIds: string[]): Promise<void> {
  if (!userIds.length) return;
  const response = await fetch(`${SUPABASE_URL}/functions/v1/send-ride-push`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_ROLE}`, apikey: SERVICE_ROLE, "content-type": "application/json" },
    body: JSON.stringify({
      user_ids: userIds,
      event: "driver.new_ride_request",
      title: "APOIS • Nova corrida disponível",
      body: `${ride.origin_name} → ${ride.destination_name}`,
      url: "/motorista/app",
      ride_id: ride.id,
    }),
  });
  if (!response.ok) console.error("[passenger-ride-request] push failed", response.status);
}

async function loadNextRideRadiusKm(admin: ReturnType<typeof createClient>): Promise<number> {
  try {
    const { data } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "ride.next_offer_max_distance_km")
      .maybeSingle();
    const parsed = Number(data?.value ?? 5);
    if (Number.isFinite(parsed)) return Math.max(0.5, Math.min(parsed, 20));
  } catch {
    // Usa o valor seguro de homologação quando a configuração não estiver disponível.
  }
  return 5;
}

async function dispatch(admin: ReturnType<typeof createClient>, ride: Record<string, unknown>): Promise<string[]> {
  const rejected = new Set(Array.isArray(ride.rejected_driver_ids) ? ride.rejected_driver_ids.map(String) : []);
  const { data: drivers, error: driverError } = await admin
    .from("drivers")
    .select("id,user_id,category,is_online,approval_status,subscription_status,current_lat,current_lng,last_location_at")
    .eq("is_online", true)
    .eq("approval_status", "aprovado");
  if (driverError) throw new Error(`driver_lookup_failed:${driverError.message}`);

  const { data: activeRides, error: activeError } = await admin
    .from("rides")
    .select("id,driver_id,status,destination_lat,destination_lng")
    .in("status", ["motorista_a_caminho", "motorista_chegou", "em_viagem"])
    .not("driver_id", "is", null);
  if (activeError) throw new Error(`active_driver_lookup_failed:${activeError.message}`);

  const { data: queuedRides, error: queuedError } = await admin
    .from("rides")
    .select("driver_id")
    .eq("status", "procurar_motorista")
    .not("queued_after_ride_id", "is", null)
    .not("driver_id", "is", null);
  if (queuedError) throw new Error(`queued_driver_lookup_failed:${queuedError.message}`);

  const activeByDriver = new Map<string, Record<string, unknown>>();
  for (const activeRide of activeRides ?? []) {
    const key = String(activeRide.driver_id ?? "");
    if (key) activeByDriver.set(key, activeRide as Record<string, unknown>);
  }
  const queuedDriverIds = new Set((queuedRides ?? []).map((row) => String(row.driver_id)));

  const origin = { lat: Number(ride.origin_lat), lng: Number(ride.origin_lng) };
  const category = normalizeCategory(ride.category);
  const now = Date.now();
  const nextRideRadiusKm = await loadNextRideRadiusKm(admin);

  type Candidate = { profileId: string; distance: number; mode: "idle" | "next" };
  const eligible: Candidate[] = [];

  for (const driver of drivers ?? []) {
    const profileId = String(driver.user_id ?? "");
    const driverId = String(driver.id ?? "");
    if (!profileId || !driverId || rejected.has(profileId)) continue;
    if (normalizeCategory(driver.category) !== category) continue;
    if (!["ativa", "teste", "active"].includes(cleanText(driver.subscription_status, 30).toLowerCase())) continue;

    if (driver.last_location_at) {
      const age = (now - new Date(driver.last_location_at).getTime()) / 1000;
      if (!Number.isFinite(age) || age > MAX_GPS_AGE_SECONDS) continue;
    }

    const currentRide = activeByDriver.get(driverId);
    const currentStatus = cleanText(currentRide?.status, 40);
    if (currentStatus === "motorista_a_caminho" || currentStatus === "motorista_chegou") continue;

    if (currentStatus === "em_viagem") {
      if (queuedDriverIds.has(driverId)) continue;
      const destinationLat = Number(currentRide?.destination_lat);
      const destinationLng = Number(currentRide?.destination_lng);
      if (!Number.isFinite(destinationLat) || !Number.isFinite(destinationLng)) continue;
      const distance = haversineKm(origin, { lat: destinationLat, lng: destinationLng });
      if (distance <= nextRideRadiusKm) eligible.push({ profileId, distance, mode: "next" });
      continue;
    }

    const lat = Number(driver.current_lat);
    const lng = Number(driver.current_lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    eligible.push({ profileId, distance: haversineKm(origin, { lat, lng }), mode: "idle" });
  }

  const idle = eligible.filter((candidate) => candidate.mode === "idle").sort((a, b) => a.distance - b.distance);
  const next = eligible.filter((candidate) => candidate.mode === "next").sort((a, b) => a.distance - b.distance);

  let selectedIdle: Candidate[] = [];
  for (const radius of DISPATCH_RADII_KM) {
    selectedIdle = idle.filter((driver) => driver.distance <= radius);
    if (selectedIdle.length) break;
  }

  const selected = [...selectedIdle, ...next]
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 20);
  const candidateIds = Array.from(new Set(selected.map((driver) => driver.profileId)));
  if (!candidateIds.length) return [];

  const { error } = await admin
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
  if (error) throw new Error(`dispatch_update_failed:${error.message}`);
  return candidateIds;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, req);

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "server_configuration_missing" }, 500, req);
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "unauthorized" }, 401, req);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const authUserId = authData.user?.id;
    if (authError || !authUserId) return json({ error: "unauthorized" }, 401, req);

    const passenger = await resolvePassenger(admin, authUserId);
    if (!passenger || passenger.deleted_at) return json({ error: "passenger_profile_missing" }, 403, req);
    if (passenger.blocked_at) return json({ error: "passenger_blocked", reason: passenger.block_reason }, 403, req);
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
    if (wallet?.is_blocked) return json({ error: "passenger_debt_block", reason: wallet.blocked_reason }, 403, req);

    const body = (await req.json()) as RequestBody;
    if (body.action === "redispatch") {
      const rideId = cleanText(body.ride_id, 50);
      if (!UUID_PATTERN.test(rideId)) return json({ error: "invalid_ride_id" }, 422, req);
      const { data: ride } = await admin.from("rides").select("*").eq("id", rideId).eq("passenger_id", passenger.id).maybeSingle();
      if (!ride) return json({ error: "ride_not_found" }, 404, req);
      if (ride.status !== "procurar_motorista" || ride.driver_id) return json({ ok: true, status: ride.status, candidates: 0 }, 200, req);
      if (ride.search_expires_at && new Date(ride.search_expires_at).getTime() <= Date.now()) {
        await admin.from("rides").update({ status: "expired", cancellation_reason: "Nenhum motorista disponível no momento.", cancelled_by: "system", cancelled_at: new Date().toISOString() }).eq("id", ride.id).eq("status", "procurar_motorista");
        return json({ ok: true, status: "expired", expired: true, candidates: 0 }, 200, req);
      }
      const candidateIds = await dispatch(admin, ride);
      EdgeRuntime.waitUntil(notifyCandidates(ride, candidateIds).catch(console.error));
      return json({ ok: true, rideId: ride.id, status: ride.status, candidates: candidateIds.length }, 200, req);
    }

    const requestKey = cleanText(body.request_key, 50);
    if (!UUID_PATTERN.test(requestKey)) return json({ error: "invalid_request_key" }, 422, req);
    if (!body.origin || !validPoint(body.origin) || !body.destination || !validPoint(body.destination)) return json({ error: "invalid_coordinates" }, 422, req);

    const intermediates = Array.isArray(body.intermediates) ? body.intermediates : [];
    if (intermediates.length > MAX_INTERMEDIATES || intermediates.some((point) => !validPoint(point))) return json({ error: "invalid_intermediates" }, 422, req);

    const categoryCode = normalizeCategory(body.category);
    if (!CATEGORY_CODES.has(categoryCode)) return json({ error: "invalid_category" }, 422, req);
    const paymentCode = normalizePayment(body.payment_method);
    if (!PAYMENT_CODES.has(paymentCode)) return json({ error: "payment_method_required" }, 422, req);

    const originName = cleanText(body.origin_name || body.origin.label, 200);
    const destinationName = cleanText(body.destination_name || body.destination.label, 200);
    if (!originName || !destinationName) return json({ error: "missing_address" }, 422, req);

    let serviceDetails: Record<string, unknown> | null;
    try { serviceDetails = sanitizeRecord(body.service_details); } catch { return json({ error: "invalid_service_details" }, 422, req); }

    const { data: existing } = await admin
      .from("rides")
      .select("id,status,estimated_price,scheduled_for")
      .eq("passenger_id", passenger.id)
      .eq("request_key", requestKey)
      .maybeSingle();
    if (existing) return json({ ok: true, reused: true, rideId: existing.id, status: existing.status, estimated_price: existing.estimated_price, scheduled_for: existing.scheduled_for }, 200, req);

    const { data: activeRide } = await admin
      .from("rides")
      .select("id,status,estimated_price,scheduled_for")
      .eq("passenger_id", passenger.id)
      .in("status", ["procurar_motorista", "motorista_a_caminho", "motorista_chegou", "em_viagem"])
      .limit(1)
      .maybeSingle();
    if (activeRide) return json({ ok: true, reused: true, rideId: activeRide.id, status: activeRide.status, estimated_price: activeRide.estimated_price }, 200, req);

    const { data: category, error: categoryError } = await admin.from("ride_categories").select("id,code").eq("code", categoryCode).eq("is_active", true).maybeSingle();
    if (categoryError || !category) return json({ error: "category_unavailable" }, 422, req);
    const { data: paymentMethod, error: paymentError } = await admin.from("payment_methods").select("code,requires_balance").eq("code", paymentCode).eq("is_active", true).maybeSingle();
    if (paymentError || !paymentMethod) return json({ error: "payment_method_unavailable" }, 422, req);

    let routeMetrics: RouteMetrics;
    try {
      routeMetrics = await calculateRoute(body.origin, body.destination, intermediates);
    } catch (error) {
      const code = error instanceof Error ? error.message : "route_calculation_failed";
      return json({ error: code === "google_routes_key_missing" ? "route_configuration_missing" : "route_calculation_failed" }, code === "google_routes_key_missing" ? 503 : 502, req);
    }

    const tariff = await loadTariff(admin, category.id);
    if (!tariff) return json({ error: "tariff_unavailable" }, 422, req);
    const fare = calculateServerFare({ category: categoryCode, distanceKm: routeMetrics.distanceKm, durationMin: routeMetrics.durationMin, tariff, stopCount: intermediates.length, serviceDetails });

    if ((paymentMethod.requires_balance || paymentCode === "wallet") && Number(wallet?.balance ?? 0) < fare.total) {
      return json({ error: "insufficient_balance", required: fare.total, balance: Number(wallet?.balance ?? 0) }, 422, req);
    }

    const scheduledFor = body.scheduled_for ? new Date(body.scheduled_for) : null;
    if (scheduledFor && !Number.isFinite(scheduledFor.getTime())) return json({ error: "invalid_scheduled_for" }, 422, req);
    const isScheduled = Boolean(scheduledFor && scheduledFor.getTime() > Date.now());
    const origin = sanitizeLocation(body.origin, originName);
    const destination = sanitizeLocation(body.destination, destinationName);
    const persistedIntermediates = intermediates.map((point, index) => ({ ...sanitizeLocation(point, `Parada ${index + 1}`), order: index }));

    const { data: ride, error: insertError } = await admin
      .from("rides")
      .insert({
        passenger_id: passenger.id,
        category: categoryCode,
        status: isScheduled ? "agendada" : "procurar_motorista",
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
        request_key: requestKey,
        scheduled_for: isScheduled ? scheduledFor?.toISOString() : null,
        pickup_label: cleanText(body.origin.label, 200) || originName,
        pickup_short_label: originName,
        pickup_address: cleanText(body.origin.address, 500) || originName,
        pickup_place_id: cleanText(body.origin.place_id, 300) || null,
        pickup_source: cleanText(body.origin.source, 30) || "gps",
        search_expires_at: isScheduled ? null : new Date(Date.now() + SEARCH_TIMEOUT_SECONDS * 1000).toISOString(),
        service_details: {
          ...(serviceDetails ?? {}),
          pricing_breakdown: { base: fare.base, extras: fare.extras, total: fare.total, pricing_version: "canonical-v2", calculated_at: new Date().toISOString() },
          client_estimated_price: finiteNumber(body.client_estimated_price) ? body.client_estimated_price : null,
        },
      })
      .select("*")
      .single();

    if (insertError?.code === "23505") {
      const { data: duplicate } = await admin.from("rides").select("id,status,estimated_price,scheduled_for").eq("passenger_id", passenger.id).in("status", ["procurar_motorista", "motorista_a_caminho", "motorista_chegou", "em_viagem"]).limit(1).maybeSingle();
      if (duplicate) return json({ ok: true, reused: true, rideId: duplicate.id, status: duplicate.status, estimated_price: duplicate.estimated_price }, 200, req);
    }
    if (insertError || !ride) return json({ error: "ride_insert_failed", detail: insertError?.message }, 500, req);

    let candidateIds: string[] = [];
    if (!isScheduled) {
      try {
        candidateIds = await dispatch(admin, ride);
        EdgeRuntime.waitUntil(notifyCandidates(ride, candidateIds).catch(console.error));
      } catch (error) {
        console.error("[passenger-ride-request] dispatch failed", error);
      }
    }

    return json({ ok: true, rideId: ride.id, status: ride.status, candidates: candidateIds.length, estimated_price: fare.total, scheduled_for: isScheduled ? scheduledFor?.toISOString() : null }, 200, req);
  } catch (error) {
    console.error("[passenger-ride-request] fatal", error);
    return json({ error: "internal_error" }, 500, req);
  }
});
