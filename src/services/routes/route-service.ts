import { invokeAuthenticatedFunction } from "@/integrations/supabase/invoke-authenticated";
import type { RouteRequest, RouteResponse, RouteStep } from "@/types/routes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readFiniteNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readNonEmptyString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function parseRouteStep(value: unknown): RouteStep | null {
  if (!isRecord(value)) return null;

  const lat = readFiniteNumber(value, "lat");
  const lng = readFiniteNumber(value, "lng");
  const distanceMeters = readFiniteNumber(value, "distanceMeters");
  const instruction = readNonEmptyString(value, "instruction");

  if (
    lat === undefined ||
    lng === undefined ||
    distanceMeters === undefined ||
    instruction === undefined
  ) {
    return null;
  }

  const step: RouteStep = {
    lat,
    lng,
    distanceMeters,
    instruction,
  };

  const maneuver = readNonEmptyString(value, "maneuver");
  if (maneuver) step.maneuver = maneuver;

  return step;
}

function parseRouteResponse(value: unknown): RouteResponse {
  if (!isRecord(value)) {
    throw new Error("route_invalid_response");
  }

  const nestedRoute = value["route"];
  const source = isRecord(nestedRoute) ? nestedRoute : value;

  const distanceMeters = readFiniteNumber(source, "distanceMeters");
  const durationSeconds = readFiniteNumber(source, "durationSeconds");
  const encodedPolyline = readNonEmptyString(source, "encodedPolyline");

  if (
    distanceMeters === undefined ||
    distanceMeters < 0 ||
    durationSeconds === undefined ||
    durationSeconds < 0 ||
    encodedPolyline === undefined
  ) {
    throw new Error("route_invalid_response");
  }

  const route: RouteResponse = {
    distanceMeters,
    durationSeconds,
    encodedPolyline,
  };

  const routeId = readNonEmptyString(source, "routeId");
  if (routeId) route.routeId = routeId;

  const provider = readNonEmptyString(source, "provider");
  if (provider) route.provider = provider;

  const rawSteps = source["steps"];
  if (Array.isArray(rawSteps)) {
    const steps = rawSteps.map(parseRouteStep).filter((step): step is RouteStep => step !== null);
    if (steps.length > 0) route.steps = steps;
  }

  return route;
}

function readErrorName(error: unknown): string {
  if (error instanceof Error) return error.name;
  return "Error";
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error["message"] === "string") return error["message"];
  return "Falha ao calcular rota";
}

class RouteService {
  private static instance: RouteService;
  private readonly cache = new Map<string, { data: RouteResponse; timestamp: number }>();
  private abortController: AbortController | null = null;
  private readonly CACHE_TTL = 300000;

  private constructor() {}

  public static getInstance(): RouteService {
    if (!RouteService.instance) {
      RouteService.instance = new RouteService();
    }
    return RouteService.instance;
  }

  public async computeRoute(request: RouteRequest): Promise<RouteResponse> {
    const cacheKey = JSON.stringify(request);
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    this.abortController?.abort();
    const controller = new AbortController();
    this.abortController = controller;

    try {
      const { data: response, error } = await invokeAuthenticatedFunction(
        "passenger-routes-compute",
        { body: request },
      );

      if (controller.signal.aborted) {
        throw new DOMException("Route request cancelled", "AbortError");
      }

      if (error) {
        throw new Error(error.message || "Falha ao calcular rota");
      }

      const routeData = parseRouteResponse(response);
      this.cache.set(cacheKey, { data: routeData, timestamp: Date.now() });
      return routeData;
    } catch (error: unknown) {
      const name = readErrorName(error);
      const message = readErrorMessage(error);

      if (name === "AbortError" || message === "geocode_cancelled") {
        throw error;
      }

      console.error("[RouteService] Error computing route via backend:", message);
      throw error instanceof Error ? error : new Error(message);
    } finally {
      if (this.abortController === controller) {
        this.abortController = null;
      }
    }
  }
}

export const routeService = RouteService.getInstance();
