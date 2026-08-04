import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GOOGLE_GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const GOOGLE_PLACES_NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby";
const REVERSE_GEOCODE_TIMEOUT_MS = 5000;
const NEARBY_PLACES_TIMEOUT_MS = 3000;

export type GeocodeComponents = {
  rua?: string;
  numero?: string;
  povoado?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  estadoSigla?: string;
  pais?: string;
};

export type GeocodeConfidence = "exact" | "approximate" | "area" | "fallback";

export type GeocodeResult = {
  address: string;
  friendly: string;
  region: string;
  approximate: boolean;
  precision: "exact" | "approximate";
  /** Nova classificação detalhada da seleção do melhor resultado. */
  confidence: GeocodeConfidence;
  /** Motivo legível pelo qual o melhor resultado foi escolhido. */
  selectionReason: string;
  locationType: string;
  partialMatch: boolean;
  plusCode?: string;
  types: string[];
  geocodedLat?: number;
  geocodedLng?: number;
  components: GeocodeComponents;
  /** Nome de um POI próximo (≤300m), quando a rua não estiver nomeada. */
  nearestPoi?: string;
  /** placeId do POI mais próximo, quando aplicável. */
  nearestPoiPlaceId?: string;
  /** Rótulo final pronto para exibição (regra MOVVI BR, nunca "Unnamed Road"). */
  pickupLabel?: string;
  /** Sub-rótulo (município/estado), pode ser igual a region. */
  pickupSubLabel?: string;
  /** Versão curta para cards / markers / notificações. */
  pickupShortLabel?: string;
  /** Origem do ponto de partida. "gps" por padrão. */
  pickupSource?: "gps" | "manual" | "places";
  diagnostic?: ReverseGeocodeDiagnostic;
};

export type ReverseGeocodeDiagnostic = {
  latitude: number;
  longitude: number;
  requestUrl: string;
  httpStatus: number | null;
  responseBody: string | null;
  googleStatus?: string;
  googleError?: string;
  rejectionReason?: string;
  failureReason?: string;
};

type GResult = {
  formatted_address?: string;
  partial_match?: boolean;
  types?: string[];
  geometry?: {
    location_type?: string;
    location?: { lat: number; lng: number };
  };
  plus_code?: {
    global_code?: string;
    compound_code?: string;
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

function emptyGeocode(diagnostic?: ReverseGeocodeDiagnostic): GeocodeResult {
  return {
    address: "",
    friendly: "",
    region: "",
    approximate: false,
    precision: "approximate",
    confidence: "fallback",
    selectionReason: "No usable result from Google Geocoding",
    locationType: "",
    partialMatch: false,
    types: [],
    components: {},
    diagnostic,
  };
}

function hasComponent(r: GResult, type: string): boolean {
  return (r.address_components ?? []).some((c) => c.types.includes(type));
}

function hasAnyComponent(r: GResult, types: string[]): boolean {
  return types.some((t) => hasComponent(r, t));
}

export function selectBestGeocodeResult(
  results: GResult[],
): { result: GResult; index: number; confidence: GeocodeConfidence; reason: string } | null {
  if (!results.length) return null;

  // Priority A: ROOFTOP with route/neighborhood/locality
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (
      r.geometry?.location_type === "ROOFTOP" &&
      hasAnyComponent(r, ["route", "neighborhood", "locality"])
    ) {
      return {
        result: r,
        index: i,
        confidence: "exact",
        reason: "ROOFTOP with route/neighborhood/locality",
      };
    }
  }
  // Priority B: RANGE_INTERPOLATED with route/neighborhood/locality
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (
      r.geometry?.location_type === "RANGE_INTERPOLATED" &&
      hasAnyComponent(r, ["route", "neighborhood", "locality"])
    ) {
      return {
        result: r,
        index: i,
        confidence: "approximate",
        reason: "RANGE_INTERPOLATED with route/neighborhood/locality",
      };
    }
  }
  // Priority C: GEOMETRIC_CENTER with usable area
  const areaTypes = [
    "neighborhood",
    "locality",
    "sublocality",
    "sublocality_level_1",
    "sublocality_level_2",
    "administrative_area_level_2",
    "administrative_area_level_3",
    "administrative_area_level_4",
  ];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (
      r.geometry?.location_type === "GEOMETRIC_CENTER" &&
      (hasAnyComponent(r, areaTypes) || !!r.formatted_address)
    ) {
      return {
        result: r,
        index: i,
        confidence: "area",
        reason: "GEOMETRIC_CENTER with usable area or formatted_address",
      };
    }
  }
  // Priority D: fallback - first result with formatted_address
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.formatted_address) {
      return {
        result: r,
        index: i,
        confidence: "fallback",
        reason: "Fallback to first result with formatted_address",
      };
    }
  }
  return {
    result: results[0],
    index: 0,
    confidence: "fallback",
    reason: "Last-resort: first result without formatted_address",
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export async function reverseGeocodeByCoordinates(data: {
  lat: number;
  lng: number;
}): Promise<GeocodeResult> {
  const apiKey = process.env.GOOGLE_MAPS_PLATFORM_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY;
  const publicRequestUrl = `${GOOGLE_GEOCODING_URL}?latlng=${data.lat},${data.lng}&language=pt-BR&region=br`;
  const url = `${publicRequestUrl}&key=${encodeURIComponent(apiKey ?? "")}`;
  const diagnosticBase: ReverseGeocodeDiagnostic = {
    latitude: data.lat,
    longitude: data.lng,
    // Nunca devolver a chave do servidor nos diagnósticos enviados ao app.
    requestUrl: publicRequestUrl,
    httpStatus: null,
    responseBody: null,
  };

  if (import.meta.env.DEV) console.log("[MOVVI Reverse Geocoding Diagnostic] latitude:", data.lat);
  if (import.meta.env.DEV) console.log("[MOVVI Reverse Geocoding Diagnostic] longitude:", data.lng);
  if (import.meta.env.DEV)
    console.log("[MOVVI Reverse Geocoding Diagnostic] request URL:", publicRequestUrl);
  if (import.meta.env.DEV)
    console.log(
      "[MOVVI Reverse Geocoding Diagnostic] Google server key:",
      apiKey ? "present" : "missing",
    );

  if (!apiKey) {
    const failureReason = "Missing required Google Maps server credential.";
    console.error("[MOVVI Reverse Geocoding Diagnostic]", failureReason);
    return emptyGeocode({ ...diagnosticBase, failureReason, rejectionReason: failureReason });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REVERSE_GEOCODE_TIMEOUT_MS);
  let res: Response;
  let responseBody = "";
  try {
    res = await fetch(url, { signal: controller.signal });
    if (import.meta.env.DEV)
      console.log("[MOVVI Reverse Geocoding Diagnostic] HTTP response status:", res.status);
    responseBody = await res.text();
  } catch (error) {
    const failureReason = isAbortError(error)
      ? `Reverse Geocoding timed out after ${REVERSE_GEOCODE_TIMEOUT_MS}ms.`
      : error instanceof Error
        ? error.message
        : String(error);
    console.error("[MOVVI Reverse Geocoding Diagnostic] Reverse Geocoding failed:", failureReason);
    return emptyGeocode({ ...diagnosticBase, failureReason, rejectionReason: failureReason });
  } finally {
    clearTimeout(timeoutId);
  }
  if (import.meta.env.DEV)
    console.log("[MOVVI Reverse Geocoding Diagnostic] complete response body:", responseBody);

  let parsedBody: unknown = {};
  try {
    parsedBody = responseBody ? JSON.parse(responseBody) : {};
  } catch (parseError) {
    console.error(
      "[MOVVI Reverse Geocoding Diagnostic] Failed to parse response body as JSON:",
      parseError,
    );
  }

  const json = (typeof parsedBody === "object" && parsedBody !== null ? parsedBody : {}) as {
    status?: string;
    error_message?: string;
    error?: string | { message?: string; status?: string; code?: string };
    results?: GResult[];
  };
  const googleError =
    json.error_message || (typeof json.error === "string" ? json.error : json.error?.message);
  const googleStatus =
    json.status || (typeof json.error === "object" ? json.error.status : undefined);
  const rejectionReason = googleError || googleStatus;
  const diagnostic: ReverseGeocodeDiagnostic = {
    ...diagnosticBase,
    httpStatus: res.status,
    // O JSON completo pode conter dados de localização e não precisa voltar
    // ao aparelho. Ele permanece disponível apenas no log de desenvolvimento.
    responseBody: null,
    googleStatus,
    googleError,
    rejectionReason,
  };

  if (googleError) {
    console.error(
      "[MOVVI Reverse Geocoding Diagnostic] Google returned error exactly:",
      googleError,
    );
  }
  if (googleStatus && googleStatus !== "OK") {
    console.error("[MOVVI Reverse Geocoding Diagnostic] Google status:", googleStatus);
  }
  if (!res.ok) {
    const failureReason = googleError || `HTTP ${res.status}`;
    console.error(
      "[MOVVI Reverse Geocoding Diagnostic] API key rejection / gateway failure reason:",
      failureReason,
    );
    return emptyGeocode({ ...diagnostic, failureReason, rejectionReason: failureReason });
  }
  if (googleStatus && googleStatus !== "OK") {
    const failureReason = googleError || googleStatus;
    console.error(
      "[MOVVI Reverse Geocoding Diagnostic] Geocoding API failure reason:",
      failureReason,
    );
    return emptyGeocode({ ...diagnostic, failureReason, rejectionReason: failureReason });
  }

  const results = json.results ?? [];
  if (!results.length) {
    const failureReason = "Google returned OK but no geocoding results.";
    console.error("[MOVVI Reverse Geocoding Diagnostic]", failureReason);
    return emptyGeocode({ ...diagnostic, failureReason });
  }

  const selection = selectBestGeocodeResult(results);
  const top = selection?.result ?? results[0];
  const confidence: GeocodeConfidence = selection?.confidence ?? "fallback";
  const selectionReason = selection?.reason ?? "No selection produced; using first result";

  if (import.meta.env.DEV)
    console.log("[MOVVI Reverse Geocoding Diagnostic] total results:", results.length);
  if (import.meta.env.DEV)
    console.log("[MOVVI Reverse Geocoding Diagnostic] selected index:", selection?.index ?? 0);
  if (import.meta.env.DEV)
    console.log(
      "[MOVVI Reverse Geocoding Diagnostic] selected formatted_address:",
      top.formatted_address ?? "(none)",
    );
  if (import.meta.env.DEV)
    console.log(
      "[MOVVI Reverse Geocoding Diagnostic] selected location_type:",
      top.geometry?.location_type ?? "(none)",
    );
  if (import.meta.env.DEV)
    console.log("[MOVVI Reverse Geocoding Diagnostic] confidence:", confidence);
  if (import.meta.env.DEV)
    console.log("[MOVVI Reverse Geocoding Diagnostic] reason:", selectionReason);

  const address = top.formatted_address ?? "";
  const locationType = top.geometry?.location_type ?? "";
  const partialMatch = !!top.partial_match;
  const plusCode = top.plus_code?.global_code;
  const topTypes = top.types ?? [];

  // Para extração de componentes, priorize o resultado selecionado, com fallback
  // para a lista completa (Google retorna componentes redundantes entre resultados).
  const orderedResults = [top, ...results.filter((r) => r !== top)];

  const povoadoCandidates = [
    ["sublocality_level_1"],
    ["sublocality_level_2"],
    ["sublocality"],
    ["neighborhood"],
    ["administrative_area_level_4"],
    ["administrative_area_level_3"],
  ];
  let povoado: { long: string; short: string } | undefined;
  for (const types of povoadoCandidates) {
    povoado = pick(orderedResults, types);
    if (povoado) break;
  }

  const ruaRaw = pick(orderedResults, ["route"]);
  const rua = isUnnamedRoad(ruaRaw?.long) ? undefined : ruaRaw;
  const numero = pick(orderedResults, ["street_number"]);
  const bairro = pick(orderedResults, ["neighborhood"]);
  const distrito =
    pick(orderedResults, ["administrative_area_level_4"]) ??
    pick(orderedResults, ["administrative_area_level_3"]);
  const cidade =
    pick(orderedResults, ["locality"]) ?? pick(orderedResults, ["administrative_area_level_2"]);
  const estado = pick(orderedResults, ["administrative_area_level_1"]);
  const pais = pick(orderedResults, ["country"]);

  const components: GeocodeComponents = {
    rua: rua?.long,
    numero: numero?.long,
    povoado: povoado?.long,
    bairro: bairro?.long,
    cidade: cidade?.long,
    estado: estado?.long,
    estadoSigla: estado?.short,
    pais: pais?.long,
  };

  const cityName = cidade?.long?.toLowerCase() ?? "";
  const candidate = povoado?.long ?? bairro?.long ?? "";
  const friendly = candidate && candidate.toLowerCase() !== cityName ? candidate : "";

  const region =
    cidade && estado ? `${cidade.long} - ${estado.short}` : (cidade?.long ?? estado?.long ?? "");

  const approximate = confidence !== "exact";

  const precision: "exact" | "approximate" = confidence === "exact" ? "exact" : "approximate";

  // POI lookup desabilitado na chamada principal — é feito em segundo plano
  // pelo cliente via `nearestPoiLookup` para não travar a UI.
  const nearestPoi: string | undefined = undefined;
  const nearestPoiPlaceId: string | undefined = undefined;

  // Detecta rodovia BR-/UF- a partir do route.short_name.
  const highwayMatch = ruaRaw?.short?.match(
    /^(BR|AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)-?\d{2,4}/i,
  );
  const highway = highwayMatch
    ? highwayMatch[0].toUpperCase().replace(/^([A-Z]{2})(\d)/, "$1-$2")
    : undefined;

  const { pickupLabel, pickupSubLabel, pickupShortLabel } = buildPickupLabel({
    components,
    region,
    nearestPoi,
    hasNamedStreet: !!rua?.long,
    distrito: distrito?.long,
    highway,
    topTypes,
  });

  return {
    address,
    friendly,
    region,
    approximate,
    precision,
    confidence,
    selectionReason,
    locationType,
    partialMatch,
    plusCode,
    types: topTypes,
    geocodedLat: top.geometry?.location?.lat,
    geocodedLng: top.geometry?.location?.lng,
    components,
    nearestPoi,
    nearestPoiPlaceId,
    pickupLabel,
    pickupSubLabel,
    pickupShortLabel,
    pickupSource: "gps",
    diagnostic,
  };
}

// Mantido para compatibilidade web. No APK, uma rota HTTP explícita do backend
// chama a mesma função pura acima.
export const reverseGeocode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<GeocodeResult> => reverseGeocodeByCoordinates(data));

function isUnnamedRoad(name?: string | null): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  return (
    n === "unnamed road" || n === "estrada sem nome" || n === "rua sem nome" || n === "via sem nome"
  );
}

function buildPickupLabel(args: {
  components: GeocodeComponents;
  region: string;
  nearestPoi?: string;
  hasNamedStreet: boolean;
  distrito?: string;
  highway?: string;
  topTypes?: string[];
}): { pickupLabel?: string; pickupSubLabel?: string; pickupShortLabel?: string } {
  const { components, region, nearestPoi, hasNamedStreet, distrito, highway, topTypes } = args;
  const { rua, numero, bairro, povoado, cidade, estado, estadoSigla } = components;

  // Sub-label padrão (município/estado).
  const sub =
    cidade && estadoSigla ? `${cidade} - ${estadoSigla}` : region || cidade || estado || "";

  const stripPrefix = (s: string) =>
    s.replace(/^\s*(povoado|comunidade|distrito|vila)\s+(de\s+|do\s+|da\s+)?/i, "").trim() || s;

  // Heurística: povoado/comunidade — prefixar quando vier de sublocality genérico.
  const prependVillage = (name: string): string => {
    const lower = name.toLowerCase();
    if (/^(povoado|comunidade|vila|distrito)\b/.test(lower)) return name;
    // Distrito tem prefixo próprio (item 3); aqui é só vila/povoado.
    return `Povoado ${name}`;
  };

  // 1) Rua nomeada (com ou sem número) — PRIORIDADE MÁXIMA.
  if (hasNamedStreet && rua) {
    const main = numero ? `${rua}, ${numero}` : rua;
    return {
      pickupLabel: main,
      pickupSubLabel: [bairro, sub].filter(Boolean).join(" • "),
      pickupShortLabel: rua,
    };
  }

  // 2) Bairro.
  if (bairro) {
    return {
      pickupLabel: bairro,
      pickupSubLabel: sub && sub !== bairro ? sub : "",
      pickupShortLabel: bairro,
    };
  }

  // 3) Distrito.
  if (distrito && distrito !== cidade) {
    const label = `Distrito de ${stripPrefix(distrito)}`;
    return { pickupLabel: label, pickupSubLabel: sub, pickupShortLabel: stripPrefix(distrito) };
  }

  // 4) Povoado / Comunidade.
  if (povoado && povoado !== cidade) {
    const label = prependVillage(povoado);
    return { pickupLabel: label, pickupSubLabel: sub, pickupShortLabel: stripPrefix(povoado) };
  }

  // 5/6) Rodovia detectada — exibe antes do POI quando o resultado principal é rodovia.
  if (highway && topTypes?.includes("route")) {
    return { pickupLabel: highway, pickupSubLabel: sub, pickupShortLabel: highway };
  }

  // 6) POI próximo (≤300m).
  if (nearestPoi) {
    return {
      pickupLabel: `Próximo a ${nearestPoi}`,
      pickupSubLabel: sub,
      pickupShortLabel: nearestPoi,
    };
  }

  // 7) Zona Rural + município.
  if (cidade || estado) {
    return {
      pickupLabel: "Zona Rural",
      pickupSubLabel: sub,
      pickupShortLabel: cidade || estado || "Zona Rural",
    };
  }

  return {};
}

async function fetchNearestPoi(
  lat: number,
  lng: number,
  apiKey: string,
): Promise<{ name: string; placeId?: string } | undefined> {
  const url = GOOGLE_PLACES_NEARBY_URL;
  const body = {
    maxResultCount: 8,
    languageCode: "pt-BR",
    regionCode: "BR",
    rankPreference: "DISTANCE",
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: 300,
      },
    },
  };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NEARBY_PLACES_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "X-Goog-Api-Key": apiKey,
        "Content-Type": "application/json",
        "X-Goog-FieldMask": "places.id,places.displayName,places.primaryType,places.types",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      if (import.meta.env.DEV)
        console.warn(
          `[MOVVI nearestPoiLookup] Nearby Places timed out after ${NEARBY_PLACES_TIMEOUT_MS}ms.`,
        );
      return undefined;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) return undefined;
  const json = (await res.json()) as {
    places?: Array<{
      id?: string;
      displayName?: { text?: string };
      primaryType?: string;
      types?: string[];
    }>;
  };
  const places = json.places ?? [];
  const skipTypes = new Set([
    "route",
    "street_address",
    "geocode",
    "political",
    "locality",
    "neighborhood",
    "sublocality",
    "plus_code",
    "premise",
    "subpremise",
  ]);
  for (const p of places) {
    const name = p.displayName?.text?.trim();
    if (!name) continue;
    const types = p.types ?? [];
    if (types.every((t) => skipTypes.has(t))) continue;
    return { name, placeId: p.id };
  }
  return undefined;
}

/**
 * Stage 2 do pipeline de pickup label: busca de POI próximo (≤300m) em
 * background. Retorna apenas o POI mais próximo; o cliente decide se
 * substitui o label atual (ex.: "Zona Rural" → "Próximo a X").
 */
export async function nearestPoiByCoordinates(data: {
  lat: number;
  lng: number;
}): Promise<{ name?: string; placeId?: string }> {
  const apiKey = process.env.GOOGLE_MAPS_PLATFORM_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return {};
  try {
    const poi = await fetchNearestPoi(data.lat, data.lng, apiKey);
    if (!poi) return {};
    return { name: poi.name, placeId: poi.placeId };
  } catch (err) {
    if (import.meta.env.DEV) console.warn("[MOVVI nearestPoiLookup] failed:", err);
    return {};
  }
}

export const nearestPoiLookup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<{ name?: string; placeId?: string }> =>
    nearestPoiByCoordinates(data),
  );
