import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";
import { isValidLatLng } from "../_shared/google-maps.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const GOOGLE_GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";

type GeocodeComponents = {
  rua?: string;
  numero?: string;
  povoado?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  estadoSigla?: string;
  pais?: string;
};

type GResult = {
  formatted_address?: string;
  partial_match?: boolean;
  types?: string[];
  geometry?: {
    location_type?: string;
    location?: { lat: number; lng: number };
  };
  address_components?: Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>;
};

type RequestBody = {
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
};

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "content-type": "application/json" },
  });
}

function pick(results: GResult[], types: string[]): { long: string; short: string } | undefined {
  for (const result of results) {
    for (const component of result.address_components ?? []) {
      if (types.every((type) => component.types.includes(type))) {
        return { long: component.long_name, short: component.short_name };
      }
    }
  }
  return undefined;
}

function hasAnyComponent(result: GResult, types: string[]): boolean {
  return types.some((type) =>
    (result.address_components ?? []).some((component) => component.types.includes(type)),
  );
}

function selectBestGeocodeResult(results: GResult[]) {
  if (!results.length) return null;

  for (const result of results) {
    if (
      result.geometry?.location_type === "ROOFTOP" &&
      hasAnyComponent(result, ["route", "neighborhood", "locality"])
    ) {
      return { result, precision: "exact" as const, confidence: "high" as const };
    }
  }

  for (const result of results) {
    if (result.geometry?.location_type === "RANGE_INTERPOLATED") {
      return {
        result,
        precision: "interpolated" as const,
        confidence: "medium" as const,
      };
    }
  }

  const result = results[0];
  const approximate =
    result.partial_match === true ||
    result.geometry?.location_type === "APPROXIMATE" ||
    result.geometry?.location_type === "GEOMETRIC_CENTER";

  return {
    result,
    precision: approximate ? ("approximate" as const) : ("unknown" as const),
    confidence: approximate ? ("low" as const) : ("medium" as const),
  };
}

function buildPickupLabel(
  components: GeocodeComponents,
  region: string,
  distrito?: string,
) {
  const { rua, numero, bairro, povoado, cidade, estadoSigla } = components;
  const sub = cidade && estadoSigla ? `${cidade} - ${estadoSigla}` : region;

  const stripPrefix = (value: string) =>
    value
      .replace(/^\s*(povoado|comunidade|distrito|vila)\s+(de\s+|do\s+|da\s+)?/i, "")
      .trim();
  const prependVillage = (name: string) =>
    /^(povoado|comunidade|vila|distrito)\b/i.test(name) ? name : `Povoado ${name}`;

  if (rua && !/unnamed road|estrada sem nome/i.test(rua)) {
    const main = numero ? `${rua}, ${numero}` : rua;
    return {
      pickupLabel: main,
      pickupSubLabel: [bairro, sub].filter(Boolean).join(" • "),
      pickupShortLabel: rua,
    };
  }

  if (bairro) {
    return { pickupLabel: bairro, pickupSubLabel: sub, pickupShortLabel: bairro };
  }

  if (distrito && distrito !== cidade) {
    return {
      pickupLabel: `Distrito de ${stripPrefix(distrito)}`,
      pickupSubLabel: sub,
      pickupShortLabel: stripPrefix(distrito),
    };
  }

  if (povoado && povoado !== cidade) {
    return {
      pickupLabel: prependVillage(povoado),
      pickupSubLabel: sub,
      pickupShortLabel: stripPrefix(povoado),
    };
  }

  return {
    pickupLabel: cidade || "Localização selecionada",
    pickupSubLabel: sub,
    pickupShortLabel: cidade || "Localização selecionada",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  try {
    const token = (req.headers.get("Authorization") ?? "")
      .replace(/^Bearer\s+/i, "")
      .trim();
    if (!token) return json(req, { error: "geocode_authentication_required" }, 401);

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) {
      return json(req, { error: "geocode_authentication_required" }, 401);
    }

    let body: RequestBody;
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      return json(req, { error: "geocode_invalid_coordinates" }, 400);
    }

    // The current passenger client sends { lat, lng }. Keep latitude/longitude
    // support for compatibility with older callers during migration.
    const lat = Number(body.lat ?? body.latitude);
    const lng = Number(body.lng ?? body.longitude);
    if (!isValidLatLng({ lat, lng })) {
      return json(req, { error: "geocode_invalid_coordinates" }, 422);
    }

    const apiKey = (
      Deno.env.get("GOOGLE_MAPS_PLATFORM_API_KEY") ||
      Deno.env.get("GOOGLE_MAPS_API_KEY") ||
      ""
    ).trim();
    if (!apiKey) {
      return json(
        req,
        {
          error: "geocode_configuration_missing",
          message: "O serviço de endereços ainda não está configurado.",
        },
        503,
      );
    }

    const url = new URL(GOOGLE_GEOCODING_URL);
    url.searchParams.set("latlng", `${lat},${lng}`);
    url.searchParams.set("language", "pt-BR");
    url.searchParams.set("region", "br");
    url.searchParams.set("key", apiKey);

    const response = await fetch(url);
    const payload = (await response.json()) as {
      status?: string;
      error_message?: string;
      results?: GResult[];
    };

    if (!response.ok || payload.status !== "OK") {
      const googleStatus = String(payload.status ?? `HTTP_${response.status}`);
      console.error("[passenger-geocode-reverse] Google Geocoding failed", {
        status: response.status,
        googleStatus,
        message: payload.error_message?.slice(0, 240),
      });

      if (googleStatus === "ZERO_RESULTS") {
        return json(req, { error: "geocode_empty_result" }, 404);
      }
      if (googleStatus === "OVER_QUERY_LIMIT") {
        return json(req, { error: "geocode_rate_limited" }, 429);
      }
      if (googleStatus === "INVALID_REQUEST") {
        return json(req, { error: "geocode_invalid_coordinates" }, 422);
      }
      return json(req, { error: "geocode_service_unavailable" }, 502);
    }

    const results = Array.isArray(payload.results) ? payload.results : [];
    const selection = selectBestGeocodeResult(results);
    if (!selection) return json(req, { error: "geocode_empty_result" }, 404);

    const top = selection.result;
    const orderedResults = [top, ...results.filter((result) => result !== top)];
    const components: GeocodeComponents = {
      rua: pick(orderedResults, ["route"])?.long,
      numero: pick(orderedResults, ["street_number"])?.long,
      povoado:
        pick(orderedResults, ["sublocality_level_1"])?.long ||
        pick(orderedResults, ["neighborhood"])?.long,
      bairro: pick(orderedResults, ["neighborhood"])?.long,
      cidade:
        pick(orderedResults, ["locality"])?.long ||
        pick(orderedResults, ["administrative_area_level_2"])?.long,
      estado: pick(orderedResults, ["administrative_area_level_1"])?.long,
      estadoSigla: pick(orderedResults, ["administrative_area_level_1"])?.short,
      pais: pick(orderedResults, ["country"])?.long,
    };

    const region =
      components.cidade && components.estadoSigla
        ? `${components.cidade} - ${components.estadoSigla}`
        : components.cidade || "";
    const distrito =
      pick(orderedResults, ["administrative_area_level_4"])?.long ||
      pick(orderedResults, ["administrative_area_level_3"])?.long;
    const labels = buildPickupLabel(components, region, distrito);

    return json(req, {
      ok: true,
      address: top.formatted_address,
      components,
      ...labels,
      region,
      approximate: selection.precision !== "exact",
      precision: selection.precision,
      confidence: selection.confidence,
      geocodedLat: top.geometry?.location?.lat,
      geocodedLng: top.geometry?.location?.lng,
    });
  } catch (error) {
    console.error("[passenger-geocode-reverse] unexpected error", error);
    return json(
      req,
      {
        error: "geocode_unknown",
        message: "Não foi possível identificar o endereço agora.",
      },
      500,
    );
  }
});
