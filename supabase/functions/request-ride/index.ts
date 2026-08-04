import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

type Point = { lat: number; lng: number };
type RequestBody = {
  action?: "create" | "redispatch";
  ride_id?: string;
  request_key?: string;
  origin: Point;
  origin_name: string;
  destination: Point;
  destination_name: string;
  category: "carros" | "motos" | "fretes" | "guincho" | "envios";
  distance_km?: number | null;
  duration_min?: number | null;
  estimated_price?: number | null;
  pickup_label?: string | null;
  pickup_short_label?: string | null;
  pickup_address?: string | null;
  pickup_place_id?: string | null;
  pickup_source?: "gps" | "manual" | "places" | null;
  payment_method?: string | null;
  service_details?: Record<string, unknown> | null;
  scheduled_for?: string | null;
};

const CATEGORIES = new Set(["carros", "motos", "fretes", "guincho", "envios"]);
const RADII_KM = [3, 5, 8, 12, 20, 30, 50];
const MAX_GPS_AGE_SECONDS = 120;
const REQUEST_TIMEOUT_SECONDS = 60;
const SEARCH_TIMEOUT_SECONDS = 180;
const GOOGLE_ROUTES_URL =
  "https://routes.googleapis.com/directions/v2:computeRoutes";

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validPoint(value: unknown): value is Point {
  if (!value || typeof value !== "object") return false;
  const p = value as Point;
  return (
    finiteNumber(p.lat) &&
    finiteNumber(p.lng) &&
    p.lat >= -90 &&
    p.lat <= 90 &&
    p.lng >= -180 &&
    p.lng <= 180
  );
}

function distanceKm(a: Point, b: Point): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const aa =
    s1 * s1 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      s2 *
      s2;
  return 2 * R * Math.asin(Math.sqrt(aa));
}

async function serverRouteMetrics(
  origin: Point,
  destination: Point,
): Promise<{ distanceKm: number; durationMin: number }> {
  const mapsKey =
    Deno.env.get("GOOGLE_MAPS_PLATFORM_API_KEY")?.trim() || "";
  if (!mapsKey) throw new Error("google_routes_key_missing");
  if (!mapsKey.startsWith("AIza") || mapsKey.length < 35) {
    throw new Error(
      `google_routes_key_invalid_format:length=${mapsKey.length}:prefix=${mapsKey.slice(0, 4)}`,
    );
  }
  console.log("[request-ride] google key loaded", {
    source: "GOOGLE_MAPS_PLATFORM_API_KEY",
    length: mapsKey.length,
    prefix: mapsKey.slice(0, 4),
  });
  const response = await fetch(GOOGLE_ROUTES_URL, {
    method: "POST",
    headers: {
      "X-Goog-Api-Key": mapsKey,
      "Content-Type": "application/json",
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
    },
    body: JSON.stringify({
      origin: {
        location: {
          latLng: { latitude: origin.lat, longitude: origin.lng },
        },
      },
      destination: {
        location: {
          latLng: { latitude: destination.lat, longitude: destination.lng },
        },
      },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      languageCode: "pt-BR",
      regionCode: "BR",
    }),
  });
  const text = await response.text();
  if (!response.ok)
    throw new Error(
      `google_routes_failed:${response.status}:${text.slice(0, 120)}`,
    );
  const payload = JSON.parse(text) as {
    routes?: Array<{ distanceMeters?: number; duration?: string }>;
  };
  const route = payload.routes?.[0];
  const distanceMeters = Number(route?.distanceMeters ?? 0);
  const durationSeconds = Number.parseInt(
    String(route?.duration ?? "0s").replace("s", ""),
    10,
  );
  if (
    !Number.isFinite(distanceMeters) ||
    distanceMeters <= 0 ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    throw new Error("google_routes_no_route");
  }
  return {
    distanceKm: Math.round((distanceMeters / 1000) * 100) / 100,
    durationMin: Math.max(1, Math.ceil(durationSeconds / 60)),
  };
}

function normalizeCategory(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function sanitizeServiceDetails(
  value: unknown,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const encoded = JSON.stringify(value);
  if (encoded.length > 12_000) throw new Error("service_details_too_large");
  return JSON.parse(encoded) as Record<string, unknown>;
}

async function loadTariff(
  admin: any,
  category: string,
): Promise<Record<string, number>> {
  const { data, error } = await admin
    .from("tariff_rules")
    .select("field_key, value")
    .eq("category_key", category);
  if (error) throw new Error(`Falha ao carregar tarifas: ${error.message}`);
  const out: Record<string, number> = {};
  for (const row of data ?? [])
    out[String(row.field_key)] = Number(row.value ?? 0);
  return out;
}

function computeFare(
  tariff: Record<string, number>,
  km: number,
  min: number,
  category: string,
  serviceDetails: Record<string, unknown> | null,
): { total: number; base: number; extras: Record<string, number> } {
  const yes = (value: unknown) =>
    value === true ||
    ["sim", "yes", "true", "1"].includes(
      String(value ?? "")
        .trim()
        .toLowerCase(),
    );
  const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const number = (value: unknown) => {
    const parsed = Number(String(value ?? "").replace(",", "."));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  const raw =
    (category === "guincho"
      ? (tariff.call_out_fee ?? tariff.base_fare ?? 0)
      : (tariff.base_fare ?? 0)) +
    (tariff.per_km ?? 0) * Math.max(0, km) +
    (tariff.per_min ?? 0) * Math.max(0, min);
  const base = Math.max(tariff.min_fare ?? 0, raw);
  const details = record(serviceDetails);
  const extras: Record<string, number> = {};
  const add = (label: string, value: number) => {
    if (Number.isFinite(value) && value > 0) {
      extras[label] = Math.round(value * 100) / 100;
    }
  };

  if (category === "fretes") {
    if (details.ajudantes === "um") add("1 ajudante", tariff.helper1_fee ?? 0);
    if (details.ajudantes === "dois")
      add("2 ajudantes", tariff.helper2_fee ?? 0);
    if (yes(details.itemPesado))
      add("Item pesado", tariff.heavy_furniture_fee ?? 0);
    if (yes(details.desmontar))
      add("Montagem/desmontagem", tariff.assembly_fee ?? 0);
    if (yes(details.embalar)) add("Embalagem", tariff.packing_fee ?? 0);
    for (const [label, location] of [
      ["Retirada", record(details.retirada)],
      ["Entrega", record(details.entrega)],
    ] as const) {
      if (yes(location.dificilAcesso))
        add(`${label}: acesso difícil`, tariff.difficult_access_fee ?? 0);
      if (yes(location.escadas) && !yes(location.elevador)) {
        add(
          `${label}: escadas`,
          (tariff.stair_fee ?? 0) * Math.max(1, number(location.andar)),
        );
      }
    }
  }

  if (category === "guincho") {
    if (["utilitario", "caminhonete"].includes(String(details.tipoVeiculo)))
      add("Veículo pesado", tariff.heavy_vehicle_fee ?? 0);
    if (yes(details.dificilAcesso))
      add("Acesso difícil", tariff.difficult_access_fee ?? 0);
    if (yes(details.acidente))
      add("Veículo acidentado", tariff.accident_fee ?? 0);
    if (yes(details.precisaPlataforma))
      add("Plataforma", tariff.platform_fee ?? 0);
    if (yes(details.rodasTravadas))
      add("Rodas travadas", tariff.locked_wheels_fee ?? 0);
    if (yes(details.garagemSubsolo))
      add("Garagem/subsolo", tariff.garage_fee ?? 0);
  }

  if (category === "envios") {
    const weightKg = number(details.weightKg);
    const maxWeight = tariff.max_weight_kg ?? 0;
    if (maxWeight > 0 && weightKg > maxWeight) {
      throw new Error("service_weight_exceeds_limit");
    }
    add("Peso", weightKg * (tariff.per_kg ?? 0));
  }

  const total =
    base + Object.values(extras).reduce((sum, value) => sum + value, 0);
  return {
    base: Math.round(base * 100) / 100,
    extras,
    total: Math.round(total * 100) / 100,
  };
}

async function dispatch(admin: any, ride: any): Promise<string[]> {
  const rejected = new Set<string>(
    Array.isArray(ride.rejected_driver_ids)
      ? ride.rejected_driver_ids.map(String)
      : [],
  );
  const { data: drivers, error } = await admin
    .from("drivers")
    .select(
      "user_id, category, is_online, approval_status, current_lat, current_lng, last_location_at",
    );
  if (error) throw new Error(`Falha ao buscar motoristas: ${error.message}`);

  const driverIds = (drivers ?? [])
    .map((driver: any) => String(driver.user_id))
    .filter(Boolean);
  const { data: activeSubscriptions, error: subscriptionsError } =
    driverIds.length
      ? await admin
          .from("subscriptions")
          .select("driver_id")
          .in("driver_id", driverIds)
          .eq("status", "active")
          .not("paid_at", "is", null)
          .or(
            `period_start.is.null,period_start.lte.${new Date().toISOString()}`,
          )
          .gt("period_end", new Date().toISOString())
      : { data: [], error: null };
  if (subscriptionsError)
    throw new Error(
      `Falha ao validar mensalidades: ${subscriptionsError.message}`,
    );
  const entitledDrivers = new Set(
    (activeSubscriptions ?? []).map((row: any) => String(row.driver_id)),
  );
  const { data: preferences, error: preferencesError } = driverIds.length
    ? await admin
        .from("driver_preferences")
        .select(
          "user_id,ride_alerts,accept_short,accept_long,max_radius_km,accept_cash,accept_pix,accept_card",
        )
        .in("user_id", driverIds)
    : { data: [], error: null };
  if (preferencesError)
    throw new Error(
      `Falha ao buscar preferências dos motoristas: ${preferencesError.message}`,
    );
  const preferencesByDriver = new Map(
    (preferences ?? []).map((pref: any) => [String(pref.user_id), pref]),
  );

  const { data: assignedRides, error: assignedError } = await admin
    .from("rides")
    .select(
      "id,driver_id,status,destination_lat,destination_lng,queued_after_ride_id",
    )
    .in("status", ["motorista_a_caminho", "motorista_chegou", "em_viagem"])
    .not("driver_id", "is", null);
  if (assignedError)
    throw new Error(
      `Falha ao verificar corridas ativas: ${assignedError.message}`,
    );

  const activeByDriver = new Map<string, any>();
  const queuedDrivers = new Set<string>();
  for (const assigned of assignedRides ?? []) {
    const driverId = String((assigned as any).driver_id ?? "");
    if (!driverId) continue;
    if ((assigned as any).queued_after_ride_id) queuedDrivers.add(driverId);
    else activeByDriver.set(driverId, assigned);
  }

  const now = Date.now();
  const origin = { lat: Number(ride.origin_lat), lng: Number(ride.origin_lng) };
  const category = normalizeCategory(ride.category);
  const isShortRide = Number(ride.distance_km ?? 0) <= 10;
  const paymentMethod = String(ride.payment_method ?? "").toLowerCase();
  const eligible = (drivers ?? [])
    .filter((d: any) => {
      if (!d.is_online || d.approval_status !== "aprovado") return false;
      if (rejected.has(String(d.user_id))) return false;
      if (!entitledDrivers.has(String(d.user_id))) return false;
      if (normalizeCategory(d.category) !== category) return false;
      if (!finiteNumber(d.current_lat) || !finiteNumber(d.current_lng))
        return false;
      if (d.last_location_at) {
        const age = (now - new Date(d.last_location_at).getTime()) / 1000;
        if (age > MAX_GPS_AGE_SECONDS) return false;
      }
      const active = activeByDriver.get(String(d.user_id));
      if (queuedDrivers.has(String(d.user_id))) return false;
      if (active && active.status !== "em_viagem") return false;
      const pref = preferencesByDriver.get(String(d.user_id));
      if (pref?.ride_alerts === false) return false;
      if (isShortRide && pref?.accept_short === false) return false;
      if (!isShortRide && pref?.accept_long === false) return false;
      if (
        (paymentMethod === "cash" || paymentMethod === "dinheiro") &&
        pref?.accept_cash === false
      )
        return false;
      if (paymentMethod === "pix" && pref?.accept_pix === false) return false;
      if (
        [
          "card",
          "credit",
          "credit_card",
          "debit",
          "debit_card",
          "maquininha",
        ].includes(paymentMethod) &&
        pref?.accept_card === false
      )
        return false;
      return true;
    })
    .map((d: any) => {
      const active = activeByDriver.get(String(d.user_id));
      const reference =
        active &&
        finiteNumber(active.destination_lat) &&
        finiteNumber(active.destination_lng)
          ? { lat: active.destination_lat, lng: active.destination_lng }
          : { lat: d.current_lat, lng: d.current_lng };
      return {
        user_id: d.user_id,
        km: distanceKm(origin, reference),
        finishingRide: Boolean(active),
        maxRadiusKm: Math.max(
          1,
          Math.min(
            50,
            Number(
              preferencesByDriver.get(String(d.user_id))?.max_radius_km ?? 10,
            ),
          ),
        ),
      };
    });

  let chosen: Array<{
    user_id: string;
    km: number;
    finishingRide: boolean;
    maxRadiusKm: number;
  }> = [];
  for (const radius of RADII_KM) {
    const within = eligible
      .filter((d) => d.km <= radius && d.km <= d.maxRadiusKm)
      .sort((a, b) => a.km - b.km);
    if (within.length) {
      chosen = within;
      break;
    }
  }
  if (!chosen.length) return [];

  const ids = chosen.map((d) => d.user_id);
  const { error: updateError } = await admin
    .from("rides")
    .update({
      candidate_driver_ids: ids,
      offered_driver_ids: ids,
      current_offer_driver_id: null,
      request_expires_at: new Date(
        Date.now() + REQUEST_TIMEOUT_SECONDS * 1000,
      ).toISOString(),
      dispatch_attempts: Number(ride.dispatch_attempts ?? 0) + 1,
    })
    .eq("id", ride.id)
    .eq("status", "procurar_motorista")
    .is("accepted_driver_id", null);
  if (updateError) throw new Error(`Falha no despacho: ${updateError.message}`);
  return ids;
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
      title: "MOVVI • Nova corrida disponível",
      body: `${ride.origin_name} → ${ride.destination_name}`,
      url: "/motorista/app",
      ride_id: ride.id,
    }),
  });
  if (!response.ok)
    console.error(
      "[request-ride] push failed",
      response.status,
      await response.text(),
    );
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS")
      return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST")
      return json({ error: "method_not_allowed" }, 405);

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } =
      await admin.auth.getUser(token);
    const userId = authData.user?.id;
    if (authError || !userId)
      return json({ error: "unauthorized", detail: authError?.message }, 401);

    const body = (await req.json()) as RequestBody;
    if (body.action === "redispatch") {
      const rideId = String(body.ride_id ?? "");
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          rideId,
        )
      ) {
        return json({ error: "invalid_ride_id" }, 422);
      }
      const { data: current, error: currentError } = await admin
        .from("rides")
        .select("*")
        .eq("id", rideId)
        .eq("passenger_id", userId)
        .maybeSingle();
      if (currentError) {
        return json(
          { error: "ride_lookup_failed", detail: currentError.message },
          500,
        );
      }
      if (!current) return json({ error: "ride_not_found" }, 404);
      if (
        current.status !== "procurar_motorista" ||
        current.accepted_driver_id ||
        current.driver_id
      ) {
        return json({
          ok: true,
          skipped: "status_changed",
          status: current.status,
          candidates: 0,
        });
      }
      const searchExpiresAt = current.search_expires_at
        ? new Date(current.search_expires_at).getTime()
        : new Date(current.created_at).getTime() +
          SEARCH_TIMEOUT_SECONDS * 1000;
      if (searchExpiresAt <= Date.now()) {
        const { error: expireError } = await admin
          .from("rides")
          .update({
            status: "cancelada_passageiro",
            cancelled_at: new Date().toISOString(),
            cancelled_by: null,
            cancel_reason: "Nenhum motorista disponível no momento.",
            candidate_driver_ids: [],
            offered_driver_ids: [],
            current_offer_driver_id: null,
          })
          .eq("id", current.id)
          .eq("status", "procurar_motorista")
          .is("accepted_driver_id", null);
        if (expireError) {
          return json(
            { error: "ride_expire_failed", detail: expireError.message },
            500,
          );
        }
        return json({
          ok: true,
          expired: true,
          status: "cancelada_passageiro",
          candidates: 0,
        });
      }
      const rejected = new Set<string>(
        Array.isArray(current.rejected_driver_ids)
          ? current.rejected_driver_ids.map(String)
          : [],
      );
      const visibleCandidates = Array.isArray(current.candidate_driver_ids)
        ? current.candidate_driver_ids
            .map(String)
            .filter((id: string) => !rejected.has(id))
        : [];
      const offerExpiresAt = current.request_expires_at
        ? new Date(current.request_expires_at).getTime()
        : 0;
      if (visibleCandidates.length && offerExpiresAt > Date.now()) {
        return json({
          ok: true,
          skipped: "already_offered",
          status: current.status,
          candidates: visibleCandidates.length,
        });
      }
      const candidateIds = await dispatch(admin, current);
      EdgeRuntime.waitUntil(
        notifyCandidates(current, candidateIds).catch((pushError) =>
          console.error("[request-ride] redispatch push failed", pushError),
        ),
      );
      return json({
        ok: true,
        skipped: null,
        status: current.status,
        candidates: candidateIds.length,
        attempts: Number(current.dispatch_attempts ?? 0) + 1,
      });
    }

    const suppliedRequestKey = String(body.request_key ?? "").trim();
    const requestKey =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        suppliedRequestKey,
      )
        ? suppliedRequestKey
        : crypto.randomUUID();
    if (!validPoint(body.origin) || !validPoint(body.destination))
      return json({ error: "invalid_coordinates" }, 422);
    if (!body.origin_name?.trim() || !body.destination_name?.trim())
      return json({ error: "missing_address" }, 422);
    if (!CATEGORIES.has(body.category))
      return json({ error: "invalid_category" }, 422);
    let serviceDetails: Record<string, unknown> | null = null;
    try {
      serviceDetails = sanitizeServiceDetails(body.service_details);
    } catch {
      return json({ error: "invalid_service_details" }, 422);
    }

    const { data: passengerUser, error: passengerError } = await admin
      .from("users")
      .select("blocked_at,suspended_until")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (passengerError)
      return json(
        { error: "passenger_status_failed", detail: passengerError.message },
        500,
      );
    if (passengerUser?.blocked_at)
      return json({ error: "passenger_blocked" }, 403);
    if (
      passengerUser?.suspended_until &&
      new Date(passengerUser.suspended_until).getTime() > Date.now()
    ) {
      return json(
        {
          error: "passenger_suspended",
          suspended_until: passengerUser.suspended_until,
        },
        403,
      );
    }
    const { data: wallet, error: walletError } = await admin
      .from("passenger_wallets")
      .select("is_blocked,blocked_reason,balance")
      .eq("passenger_id", userId)
      .maybeSingle();
    if (walletError)
      return json(
        { error: "wallet_status_failed", detail: walletError.message },
        500,
      );
    if (wallet?.is_blocked)
      return json(
        {
          error: "passenger_debt_block",
          reason: wallet.blocked_reason,
          balance: wallet.balance,
        },
        403,
      );

    const { data: existingByKey, error: keyLookupError } = await admin
      .from("rides")
      .select("id,status,estimated_price,scheduled_for")
      .eq("passenger_id", userId)
      .eq("request_key", requestKey)
      .maybeSingle();
    if (keyLookupError)
      return json(
        { error: "idempotency_lookup_failed", detail: keyLookupError.message },
        500,
      );
    if (existingByKey) {
      return json({
        ok: true,
        reused: true,
        rideId: existingByKey.id,
        status: existingByKey.status,
        scheduled_for: existingByKey.scheduled_for,
        estimated_price: existingByKey.estimated_price,
      });
    }

    if (!body.scheduled_for) {
      const { data: activeRide, error: activeRideError } = await admin
        .from("rides")
        .select("id,status,estimated_price,scheduled_for")
        .eq("passenger_id", userId)
        .in("status", [
          "procurar_motorista",
          "motorista_a_caminho",
          "motorista_chegou",
          "em_viagem",
        ])
        .limit(1)
        .maybeSingle();
      if (activeRideError)
        return json(
          {
            error: "active_ride_lookup_failed",
            detail: activeRideError.message,
          },
          500,
        );
      if (activeRide) {
        console.log("[request-ride] reusing active ride", {
          rideId: activeRide.id,
          status: activeRide.status,
        });
        return json({
          ok: true,
          reused: true,
          rideId: activeRide.id,
          status: activeRide.status,
          scheduled_for: activeRide.scheduled_for ?? null,
          estimated_price: activeRide.estimated_price ?? null,
        });
      }
    }

    let scheduledFor: string | null = null;
    if (body.scheduled_for != null && String(body.scheduled_for).trim()) {
      const scheduledAt = new Date(body.scheduled_for);
      const scheduledMs = scheduledAt.getTime();
      const delayMs = scheduledMs - Date.now();
      if (!Number.isFinite(scheduledMs))
        return json({ error: "invalid_scheduled_for" }, 422);
      if (delayMs < 15 * 60 * 1000)
        return json({ error: "scheduled_too_soon" }, 422);
      if (delayMs > 30 * 24 * 60 * 60 * 1000)
        return json({ error: "scheduled_too_far" }, 422);

      const { data: scheduledSetting, error: settingError } = await admin
        .from("app_settings")
        .select("value")
        .eq("key", "ride.allow_scheduled")
        .maybeSingle();
      if (settingError)
        return json(
          { error: "scheduled_setting_failed", detail: settingError.message },
          500,
        );
      if (
        scheduledSetting?.value === false ||
        String(scheduledSetting?.value).toLowerCase() === "false"
      ) {
        return json({ error: "scheduled_rides_disabled" }, 403);
      }
      scheduledFor = scheduledAt.toISOString();
    }

    let routeMetrics: { distanceKm: number; durationMin: number };
    try {
      routeMetrics = await serverRouteMetrics(body.origin, body.destination);
    } catch (routeError) {
      console.error("[request-ride] server route failed", routeError);
      return json({ error: "route_calculation_failed" }, 502);
    }
    const finalKm = routeMetrics.distanceKm;
    const finalMin = routeMetrics.durationMin;
    const tariff = await loadTariff(admin, body.category);
    let fare;
    try {
      fare = computeFare(
        tariff,
        finalKm,
        finalMin,
        body.category,
        serviceDetails,
      );
    } catch (fareError) {
      return json(
        {
          error:
            fareError instanceof Error
              ? fareError.message
              : "invalid_service_pricing",
        },
        422,
      );
    }
    const estimatedPrice = fare.total;
    const persistedServiceDetails = serviceDetails
      ? {
          ...serviceDetails,
          pricing_breakdown: {
            base: fare.base,
            extras: fare.extras,
            total: fare.total,
            calculated_at: new Date().toISOString(),
          },
        }
      : null;

    const { data: ride, error: insertError } = await admin
      .from("rides")
      .insert({
        passenger_id: userId,
        category: body.category,
        origin_lat: body.origin.lat,
        origin_lng: body.origin.lng,
        origin_name: body.origin_name.trim(),
        destination_lat: body.destination.lat,
        destination_lng: body.destination.lng,
        destination_name: body.destination_name.trim(),
        distance_km: finalKm,
        duration_min: finalMin,
        estimated_price: estimatedPrice,
        status: scheduledFor ? "agendada" : "procurar_motorista",
        scheduled_for: scheduledFor,
        pickup_label: body.pickup_label ?? null,
        pickup_short_label: body.pickup_short_label ?? null,
        pickup_address: body.pickup_address ?? null,
        pickup_place_id: body.pickup_place_id ?? null,
        pickup_source: body.pickup_source ?? "gps",
        payment_method: body.payment_method?.trim() || null,
        service_details: persistedServiceDetails,
        request_key: requestKey,
        search_expires_at: scheduledFor
          ? null
          : new Date(Date.now() + SEARCH_TIMEOUT_SECONDS * 1000).toISOString(),
      })
      .select("*")
      .single();
    if (insertError?.code === "23505") {
      const { data: duplicate } = await admin
        .from("rides")
        .select("id,status,estimated_price,scheduled_for")
        .eq("passenger_id", userId)
        .eq("request_key", requestKey)
        .maybeSingle();
      if (duplicate) {
        return json({
          ok: true,
          reused: true,
          rideId: duplicate.id,
          status: duplicate.status,
          scheduled_for: duplicate.scheduled_for,
          estimated_price: duplicate.estimated_price,
        });
      }
      const { data: activeAfterConflict } = await admin
        .from("rides")
        .select("id,status,estimated_price,scheduled_for")
        .eq("passenger_id", userId)
        .in("status", [
          "procurar_motorista",
          "motorista_a_caminho",
          "motorista_chegou",
          "em_viagem",
        ])
        .limit(1)
        .maybeSingle();
      if (activeAfterConflict) {
        console.log("[request-ride] reusing active ride after conflict", {
          rideId: activeAfterConflict.id,
          status: activeAfterConflict.status,
        });
        return json({
          ok: true,
          reused: true,
          rideId: activeAfterConflict.id,
          status: activeAfterConflict.status,
          scheduled_for: activeAfterConflict.scheduled_for ?? null,
          estimated_price: activeAfterConflict.estimated_price ?? null,
        });
      }
      return json({ error: "passenger_already_has_active_ride" }, 409);
    }
    if (insertError || !ride)
      return json(
        { error: "ride_insert_failed", detail: insertError?.message },
        500,
      );

    let candidateIds: string[] = [];
    if (!scheduledFor) {
      try {
        candidateIds = await dispatch(admin, ride);
        EdgeRuntime.waitUntil(
          notifyCandidates(ride, candidateIds).catch((pushError) =>
            console.error("[request-ride] push failed", pushError),
          ),
        );
      } catch (dispatchError) {
        console.error("[request-ride] dispatch failed", dispatchError);
      }
    }

    return json({
      ok: true,
      rideId: ride.id,
      candidates: candidateIds.length,
      scheduled_for: scheduledFor,
      status: scheduledFor ? "agendada" : "procurar_motorista",
      estimated_price: estimatedPrice,
    });
  } catch (error) {
    console.error("[request-ride] fatal", error);
    return json(
      {
        error: "internal_error",
        detail: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
