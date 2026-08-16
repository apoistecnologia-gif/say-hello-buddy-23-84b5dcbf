import { supabase } from "@/integrations/supabase/client";
import {
  GeocodeCoordinates,
  PickupAddress,
  GeocodeError,
  GeocodeErrorCode,
  GEOCODE_MESSAGES_PT,
  AddressPrecision,
  AddressConfidence,
  GeocodeComponents,
} from "../../types/geocoding";

interface GeocodeCacheEntry {
  address: PickupAddress;
  timestamp: number;
}

interface GeocodePayload {
  pickupLabel?: string;
  pickupShortLabel?: string;
  pickupSubLabel?: string;
  address?: string;
  region?: string;
  approximate?: boolean;
  precision?: AddressPrecision;
  confidence?: AddressConfidence;
  components?: GeocodeComponents;
  nearestPoi?: string;
  plusCode?: string;
  geocodedLat?: number;
  geocodedLng?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function readComponents(value: unknown): GeocodeComponents | undefined {
  if (!isRecord(value)) return undefined;

  const components: GeocodeComponents = {};
  const keys: Array<keyof GeocodeComponents> = [
    "rua",
    "numero",
    "povoado",
    "bairro",
    "cidade",
    "estado",
    "estadoSigla",
    "pais",
  ];

  for (const key of keys) {
    const current = value[key];
    if (typeof current === "string" && current.trim()) {
      components[key] = current;
    }
  }

  return Object.keys(components).length > 0 ? components : undefined;
}

function parseGeocodePayload(value: unknown): GeocodePayload {
  if (!isRecord(value)) {
    throw new Error("geocode_invalid_response");
  }

  const nestedGeo = value["geo"];
  const source = isRecord(nestedGeo) ? nestedGeo : value;
  const payload: GeocodePayload = {};

  const pickupLabel = readString(source, "pickupLabel");
  const pickupShortLabel = readString(source, "pickupShortLabel");
  const pickupSubLabel = readString(source, "pickupSubLabel");
  const address = readString(source, "address");
  const region = readString(source, "region");
  const approximate = readBoolean(source, "approximate");
  const precision = readString(source, "precision");
  const confidence = readString(source, "confidence");
  const components = readComponents(source["components"]);
  const nearestPoi = readString(source, "nearestPoi");
  const plusCode = readString(source, "plusCode");
  const geocodedLat = readNumber(source, "geocodedLat");
  const geocodedLng = readNumber(source, "geocodedLng");

  if (pickupLabel) payload.pickupLabel = pickupLabel;
  if (pickupShortLabel) payload.pickupShortLabel = pickupShortLabel;
  if (pickupSubLabel) payload.pickupSubLabel = pickupSubLabel;
  if (address) payload.address = address;
  if (region) payload.region = region;
  if (approximate !== undefined) payload.approximate = approximate;

  if (
    precision === "exact" ||
    precision === "approximate" ||
    precision === "range" ||
    precision === "interpolated" ||
    precision === "unknown"
  ) {
    payload.precision = precision;
  }

  if (
    confidence === "high" ||
    confidence === "medium" ||
    confidence === "low" ||
    confidence === "none"
  ) {
    payload.confidence = confidence;
  }

  if (components) payload.components = components;
  if (nearestPoi) payload.nearestPoi = nearestPoi;
  if (plusCode) payload.plusCode = plusCode;
  if (geocodedLat !== undefined) payload.geocodedLat = geocodedLat;
  if (geocodedLng !== undefined) payload.geocodedLng = geocodedLng;

  return payload;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error["message"] === "string") return error["message"];
  return "geocode_unknown";
}

class GeocodingService {
  private static instance: GeocodingService;
  private cache: Map<string, GeocodeCacheEntry> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000;
  private readonly MAX_CACHE_SIZE = 50;
  private pendingRequests: Map<string, AbortController> = new Map();

  private constructor() {}

  public static getInstance(): GeocodingService {
    if (!GeocodingService.instance) {
      GeocodingService.instance = new GeocodingService();
    }
    return GeocodingService.instance;
  }

  private getCacheKey(lat: number, lng: number): string {
    const precision = 4;
    return `${lat.toFixed(precision)},${lng.toFixed(precision)}`;
  }

  public async resolvePickupAddress(coords: GeocodeCoordinates): Promise<PickupAddress> {
    const cacheKey = this.getCacheKey(coords.lat, coords.lng);
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return { ...cached.address, source: "cache" };
    }

    this.pendingRequests.get(cacheKey)?.abort();

    const controller = new AbortController();
    this.pendingRequests.set(cacheKey, controller);

    try {
      // The official APOIS CORRIDAS production backend exposes a single
      // authenticated reverse-geocoding Edge Function. Do not issue a second
      // request to the retired/non-deployed passenger-geocode-nearest-poi slug:
      // that call returned 404 in production. Any optional enrichment returned
      // by the canonical reverse contract is already parsed below.
      const { data: response, error } = await supabase.functions.invoke(
        "passenger-geocode-reverse",
        { body: coords },
      );

      if (error) {
        throw new Error(error.message || "geocode_empty_result");
      }

      const pickupAddress = this.transformToPickupAddress(
        coords,
        parseGeocodePayload(response),
      );

      this.addToCache(cacheKey, pickupAddress);
      return pickupAddress;
    } catch (error: unknown) {
      const message = readErrorMessage(error);
      if (message === "geocode_cancelled") throw error;
      throw this.normalizeError(message);
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  private transformToPickupAddress(
    coords: GeocodeCoordinates,
    data: GeocodePayload,
  ): PickupAddress {
    const components = data.components ?? {};
    const label =
      data.pickupLabel ||
      data.pickupShortLabel ||
      data.address ||
      (components.rua
        ? `${components.rua}${components.numero ? `, ${components.numero}` : ""}`
        : undefined) ||
      data.region ||
      "Endereço não identificado";

    const subLabel =
      data.pickupSubLabel ||
      (components.bairro
        ? `${components.bairro}${components.cidade ? ` • ${components.cidade}` : ""}`
        : components.cidade);

    const pickupAddress: PickupAddress = {
      latitude: coords.lat,
      longitude: coords.lng,
      label,
      precision: data.precision ?? (data.approximate ? "approximate" : "exact"),
      confidence: data.confidence ?? "medium",
      isApproximate: data.approximate === true || data.precision === "approximate",
      source: "gps",
      timestamp: Date.now(),
      geocodedPosition:
        data.geocodedLat !== undefined && data.geocodedLng !== undefined
          ? { lat: data.geocodedLat, lng: data.geocodedLng }
          : null,
    };

    if (subLabel) pickupAddress.subLabel = subLabel;
    if (data.pickupShortLabel) pickupAddress.shortLabel = data.pickupShortLabel;
    if (data.components) pickupAddress.components = data.components;
    if (data.address) pickupAddress.address = data.address;
    if (data.nearestPoi) pickupAddress.nearestPoi = data.nearestPoi;
    if (data.plusCode) pickupAddress.plusCode = data.plusCode;

    return pickupAddress;
  }

  private addToCache(key: string, address: PickupAddress): void {
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (typeof firstKey === "string") this.cache.delete(firstKey);
    }
    this.cache.set(key, { address, timestamp: Date.now() });
  }

  public clearCache(): void {
    this.cache.clear();
    this.pendingRequests.forEach((controller) => controller.abort());
    this.pendingRequests.clear();
  }

  public normalizeError(code: string): GeocodeError {
    const validCode = (
      GEOCODE_MESSAGES_PT[code as GeocodeErrorCode] ? code : "geocode_unknown"
    ) as GeocodeErrorCode;
    return {
      code: validCode,
      message: GEOCODE_MESSAGES_PT[validCode],
    };
  }
}

export const geocodingService = GeocodingService.getInstance();