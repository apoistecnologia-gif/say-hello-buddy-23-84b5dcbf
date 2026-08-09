import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const MAX_STOPS = 3;

type Point = { lat: number; lng: number };
type RequestBody = {
  origin?: Point;
  destination?: Point;
  stops?: Point[];
  intermediates?: Point[];
};

type GoogleRouteStep = {
  distanceMeters?: number;
  endLocation?: { latLng?: { latitude?: number; longitude?: number } };
  navigationInstruction?: { maneuver?: string; instructions?: string };
};

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "content-type": "application/json" },
  });
}

function validPoint(value: unknown): value is Point {
  if (!value || typeof value !== "object") return false;
  const point = value as Point;
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lng >= -180 &&
    point.lng <= 180
  );
}

function durationSeconds(value: unknown): number {
  const match = String(value ?? "").match(/^([0-9]+(?:\.[0-9]+)?)s$/);
  return match ? Math.round(Number(match[1])) : 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json(req, { error: "unauthorized" }, 401);

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return json(req, { error: "unauthorized" }, 401);

    let body: RequestBody;
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      return json(req, { error: "invalid_json" }, 400);
    }

    const stops = Array.isArray(body.stops)
      ? body.stops
      : Array.isArray(body.intermediates)
        ? body.intermediates
        : [];

    if (!validPoint(body.origin) || !validPoint(body.destination)) {
      return json(req, { error: "invalid_origin_or_destination" }, 422);
    }
    if (stops.length > MAX_STOPS || stops.some((stop) => !validPoint(stop))) {
      return json(req, { error: "invalid_stops", maxStops: MAX_STOPS }, 422);
    }

    const mapsKey = (
      Deno.env.get("GOOGLE_MAPS_PLATFORM_API_KEY") ||
      Deno.env.get("GOOGLE_ROUTES_API_KEY") ||
      Deno.env.get("GOOGLE_MAPS_API_KEY") ||
      ""
    ).trim();
    if (!mapsKey) {
      return json(
        req,
        {
          error: "route_configuration_missing",
          message: "O cálculo de rota ainda não está configurado.",
        },
        503,
      );
    }

    const response = await fetch(GOOGLE_ROUTES_URL, {
      method: "POST",
      headers: {
        "X-Goog-Api-Key": mapsKey,
        "X-Goog-FieldMask": [
          "routes.distanceMeters",
          "routes.duration",
          "routes.polyline.encodedPolyline",
          "routes.legs.steps.distanceMeters",
          "routes.legs.steps.endLocation.latLng",
          "routes.legs.steps.navigationInstruction",
        ].join(","),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        origin: {
          location: {
            latLng: { latitude: body.origin.lat, longitude: body.origin.lng },
          },
        },
        destination: {
          location: {
            latLng: { latitude: body.destination.lat, longitude: body.destination.lng },
          },
        },
        intermediates: stops.map((stop) => ({
          location: { latLng: { latitude: stop.lat, longitude: stop.lng } },
        })),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        polylineEncoding: "ENCODED_POLYLINE",
        languageCode: "pt-BR",
        regionCode: "BR",
      }),
    });

    const raw = await response.text();
    if (!response.ok) {
      console.error("[passenger-routes-compute] Google Routes failed", {
        status: response.status,
        body: raw.slice(0, 400),
      });
      return json(
        req,
        {
          error: "route_calculation_failed",
          message: "Não foi possível calcular a rota agora.",
        },
        502,
      );
    }

    const payload = JSON.parse(raw) as {
      routes?: Array<{
        distanceMeters?: number;
        duration?: string;
        polyline?: { encodedPolyline?: string };
        legs?: Array<{ steps?: GoogleRouteStep[] }>;
      }>;
    };
    const route = payload.routes?.[0];
    const distanceMeters = Number(route?.distanceMeters ?? 0);
    const seconds = durationSeconds(route?.duration);
    const encodedPolyline = String(route?.polyline?.encodedPolyline ?? "");

    if (!(distanceMeters > 0) || !(seconds > 0) || !encodedPolyline) {
      return json(req, { error: "route_not_found" }, 404);
    }

    const steps = (route?.legs ?? [])
      .flatMap((leg) => leg.steps ?? [])
      .map((step) => {
        const lat = Number(step.endLocation?.latLng?.latitude);
        const lng = Number(step.endLocation?.latLng?.longitude);
        const instruction = String(step.navigationInstruction?.instructions ?? "").trim();
        const maneuver = String(step.navigationInstruction?.maneuver ?? "").trim() || null;
        return {
          lat,
          lng,
          distanceMeters: Number(step.distanceMeters ?? 0),
          instruction,
          maneuver,
        };
      })
      .filter((step) => Number.isFinite(step.lat) && Number.isFinite(step.lng) && step.instruction.length > 0);

    return json(req, {
      ok: true,
      distanceMeters,
      distanceKm: Math.round((distanceMeters / 1000) * 100) / 100,
      durationSeconds: seconds,
      durationMinutes: Math.max(1, Math.ceil(seconds / 60)),
      encodedPolyline,
      steps,
      provider: "google",
    });
  } catch (error) {
    console.error("[passenger-routes-compute] unexpected error", error);
    return json(
      req,
      {
        error: "unexpected_error",
        message: "Não foi possível calcular a rota agora.",
      },
      500,
    );
  }
});
