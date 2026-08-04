import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";
import { isValidLatLng } from "../_shared/google-maps.ts";

const GOOGLE_GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";

interface GeocodeComponents {
  rua?: string;
  numero?: string;
  povoado?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  estadoSigla?: string;
  pais?: string;
}

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

function pick(results: GResult[], types: string[]): { long: string; short: string } | undefined {
  for (const r of results) {
    for (const c of r.address_components ?? []) {
      if (types.every((t) => c.types.includes(t))) {
        return { long: c.long_name, short: c.short_name };
      }
    }
  }
  return undefined;
}

function hasAnyComponent(r: GResult, types: string[]): boolean {
  return types.some((t) => (r.address_components ?? []).some((c) => c.types.includes(t)));
}

function selectBestGeocodeResult(results: GResult[]) {
  if (!results.length) return null;
  // Priority A: ROOFTOP with route/neighborhood/locality
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (
      r.geometry?.location_type === "ROOFTOP" &&
      hasAnyComponent(r, ["route", "neighborhood", "locality"])
    ) {
      return { result: r, confidence: "exact", reason: "ROOFTOP" };
    }
  }
  // Priority B: RANGE_INTERPOLATED
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.geometry?.location_type === "RANGE_INTERPOLATED") {
      return { result: r, confidence: "approximate", reason: "RANGE_INTERPOLATED" };
    }
  }
  return { result: results[0], confidence: "fallback", reason: "First result" };
}

function buildPickupLabel(
  components: GeocodeComponents,
  region: string,
  topTypes: string[],
  distrito?: string,
) {
  const { rua, numero, bairro, povoado, cidade, estadoSigla } = components;
  const sub = cidade && estadoSigla ? `${cidade} - ${estadoSigla}` : region;

  const stripPrefix = (s: string) =>
    s.replace(/^\s*(povoado|comunidade|distrito|vila)\s+(de\s+|do\s+|da\s+)?/i, "").trim();
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
  if (bairro) return { pickupLabel: bairro, pickupSubLabel: sub, pickupShortLabel: bairro };
  if (distrito && distrito !== cidade)
    return {
      pickupLabel: `Distrito de ${stripPrefix(distrito)}`,
      pickupSubLabel: sub,
      pickupShortLabel: stripPrefix(distrito),
    };
  if (povoado && povoado !== cidade)
    return {
      pickupLabel: prependVillage(povoado),
      pickupSubLabel: sub,
      pickupShortLabel: stripPrefix(povoado),
    };

  return {
    pickupLabel: "Zona Rural",
    pickupSubLabel: sub,
    pickupShortLabel: cidade || "Zona Rural",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();
    if (authError || !user)
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: getCorsHeaders(req),
      });

    const { latitude, longitude } = await req.json();
    if (!isValidLatLng({ lat: latitude, lng: longitude })) {
      return new Response(JSON.stringify({ error: "Invalid coordinates" }), {
        status: 400,
        headers: getCorsHeaders(req),
      });
    }

    const apiKey =
      Deno.env.get("GOOGLE_MAPS_PLATFORM_API_KEY") || Deno.env.get("GOOGLE_MAPS_API_KEY");
    const url = `${GOOGLE_GEOCODING_URL}?latlng=${latitude},${longitude}&language=pt-BR&region=br&key=${apiKey}`;

    const res = await fetch(url);
    const json = await res.json();
    if (json.status !== "OK")
      return new Response(JSON.stringify({ error: json.status }), {
        status: 500,
        headers: getCorsHeaders(req),
      });

    const results = json.results as GResult[];
    const selection = selectBestGeocodeResult(results);
    const top = selection?.result ?? results[0];

    const orderedResults = [top, ...results.filter((r) => r !== top)];
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

    const labels = buildPickupLabel(components, region, top.types || [], distrito);

    return new Response(
      JSON.stringify({
        address: top.formatted_address,
        components,
        ...labels,
        latitude: top.geometry?.location?.lat,
        longitude: top.geometry?.location?.lng,
      }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: getCorsHeaders(req),
    });
  }
});
