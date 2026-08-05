import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_GPS_AGE_SECONDS = 120;
const OFFER_SECONDS = 20;
const SEARCH_TIMEOUT_SECONDS = 180;
const RADII_KM = [3, 5, 8, 12, 20, 30, 50];

function json(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(req ? getCorsHeaders(req) : {}),
      "content-type": "application/json",
    },
  });
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const radius = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const value =
    s1 * s1 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      s2 * s2;
  return 2 * radius * Math.asin(Math.sqrt(value));
}

async function notifyDrivers(ride: Record<string, unknown>, driverIds: string[]): Promise<void> {
  if (!driverIds.length) return;
  const response = await fetch(`${SUPABASE_URL}/functions/v1/send-ride-push`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      user_ids: driverIds,
      event: "driver.new_ride_request",
      title: "APOIS • Nova corrida disponível",
      body: `${String(ride.origin_name ?? "Origem")} → ${String(ride.destination_name ?? "Destino")}`,
      url: "/motorista/app",
      ride_id: String(ride.id ?? ""),
    }),
  });
  if (!response.ok) {
    console.error("[process-ride-dispatch] push failed", response.status, await response.text());
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, req);

    const authorization = req.headers.get("Authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!token || token !== SERVICE_ROLE) return json({ error: "unauthorized" }, 401, req);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const now = new Date();
    const { data: rides, error: ridesError } = await admin
      .from("rides")
      .select("*")
      .eq("status", "procurar_motorista")
      .is("driver_id", null)
      .is("accepted_driver_id", null)
      .order("created_at", { ascending: true })
      .limit(50);

    if (ridesError) return json({ error: "ride_lookup_failed", detail: ridesError.message }, 500, req);

    let redistributed = 0;
    let expired = 0;
    let untouched = 0;

    for (const ride of rides ?? []) {
      const createdAt = new Date(ride.created_at).getTime();
      const searchExpiresAt = ride.search_expires_at
        ? new Date(ride.search_expires_at).getTime()
        : createdAt + SEARCH_TIMEOUT_SECONDS * 1000;

      if (searchExpiresAt <= now.getTime()) {
        const { error } = await admin
          .from("rides")
          .update({
            status: "cancelada_passageiro",
            cancelled_at: now.toISOString(),
            cancelled_by: null,
            cancellation_reason: "Nenhum motorista disponível no momento.",
            candidate_driver_ids: [],
            offered_driver_ids: [],
            current_offer_driver_id: null,
          })
          .eq("id", ride.id)
          .eq("status", "procurar_motorista")
          .is("driver_id", null);
        if (!error) expired += 1;
        continue;
      }

      const offerExpiresAt = ride.request_expires_at
        ? new Date(ride.request_expires_at).getTime()
        : 0;
      if (offerExpiresAt > now.getTime()) {
        untouched += 1;
        continue;
      }

      const rejected = new Set<string>(
        Array.isArray(ride.rejected_driver_ids) ? ride.rejected_driver_ids.map(String) : [],
      );
      const previouslyOffered = new Set<string>(
        Array.isArray(ride.offered_driver_ids) ? ride.offered_driver_ids.map(String) : [],
      );

      const { data: drivers, error: driversError } = await admin
        .from("drivers")
        .select("user_id,category,is_online,approval_status,current_lat,current_lng,last_location_at")
        .eq("is_online", true)
        .eq("approval_status", "aprovado")
        .eq("category", ride.category);
      if (driversError) continue;

      const driverIds = (drivers ?? []).map((driver) => String(driver.user_id));
      const { data: activeRides } = driverIds.length
        ? await admin
            .from("rides")
            .select("driver_id")
            .in("driver_id", driverIds)
            .in("status", ["motorista_a_caminho", "motorista_chegou", "em_viagem"])
        : { data: [] };
      const occupied = new Set((activeRides ?? []).map((item) => String(item.driver_id)));

      const origin = { lat: Number(ride.origin_lat), lng: Number(ride.origin_lng) };
      const eligible = (drivers ?? [])
        .filter((driver) => {
          const id = String(driver.user_id);
          if (rejected.has(id) || occupied.has(id)) return false;
          if (previouslyOffered.has(id)) return false;
          if (!Number.isFinite(driver.current_lat) || !Number.isFinite(driver.current_lng)) return false;
          const ageSeconds = driver.last_location_at
            ? (now.getTime() - new Date(driver.last_location_at).getTime()) / 1000
            : Number.POSITIVE_INFINITY;
          return ageSeconds <= MAX_GPS_AGE_SECONDS;
        })
        .map((driver) => ({
          id: String(driver.user_id),
          distance: distanceKm(origin, {
            lat: Number(driver.current_lat),
            lng: Number(driver.current_lng),
          }),
        }))
        .sort((a, b) => a.distance - b.distance);

      let selected: string[] = [];
      for (const radius of RADII_KM) {
        selected = eligible.filter((driver) => driver.distance <= radius).slice(0, 5).map((driver) => driver.id);
        if (selected.length) break;
      }

      if (!selected.length) {
        untouched += 1;
        continue;
      }

      const nextOffered = Array.from(new Set([...previouslyOffered, ...selected]));
      const { data: updated, error: updateError } = await admin
        .from("rides")
        .update({
          candidate_driver_ids: selected,
          offered_driver_ids: nextOffered,
          current_offer_driver_id: null,
          request_expires_at: new Date(now.getTime() + OFFER_SECONDS * 1000).toISOString(),
          dispatch_attempts: Number(ride.dispatch_attempts ?? 0) + 1,
        })
        .eq("id", ride.id)
        .eq("status", "procurar_motorista")
        .is("driver_id", null)
        .is("accepted_driver_id", null)
        .select("*")
        .maybeSingle();

      if (updateError || !updated) continue;
      redistributed += 1;
      EdgeRuntime.waitUntil(
        notifyDrivers(updated, selected).catch((error) =>
          console.error("[process-ride-dispatch] notify failed", error),
        ),
      );
    }

    return json({ ok: true, redistributed, expired, untouched }, 200, req);
  } catch (error) {
    console.error("[process-ride-dispatch] fatal", error);
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
