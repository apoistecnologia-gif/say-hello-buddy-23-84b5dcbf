import { 
  RouteCoordinates, 
  RouteRequest, 
  RouteResponse, 
  RouteResult, 
  RouteError,
  RouteSource
} from "@/types/routes";
import { apiClient } from "../api/api-client";
import { ROUTE_CONFIG, ROUTE_ERROR_MESSAGES } from "./route-config";
import { PolylineDecoder } from "./polyline-decoder";

interface CacheEntry {
  result: RouteResult;
  timestamp: number;
}

class RouteService {
  private static instance: RouteService;
  private cache: Map<string, CacheEntry> = new Map();
  private activeController: AbortController | null = null;

  private constructor() {}

  public static getInstance(): RouteService {
    if (!RouteService.instance) {
      RouteService.instance = new RouteService();
    }
    return RouteService.instance;
  }

  public async computeRoute(origin: RouteCoordinates, destination: RouteCoordinates): Promise<RouteResult> {
    const requestKey = this.createRequestKey(origin, destination);
    
    // Check Cache
    const cached = this.cache.get(requestKey);
    if (cached && Date.now() - cached.timestamp < ROUTE_CONFIG.CACHE_TTL_MS) {
      return cached.result;
    }

    this.cancelPendingRoute();
    this.activeController = new AbortController();

    const request: RouteRequest = { origin, destination };

    try {
      const response = await apiClient.post<RouteResponse>('/api/passenger/routes/compute', request, {
        timeout: ROUTE_CONFIG.TIMEOUT_MS,
        signal: this.activeController.signal
      });

      if (!response.ok || !response.route) {
        throw new Error('route_not_found');
      }

      const decodedPoints = PolylineDecoder.decode(response.route.encodedPolyline);
      
      const result: RouteResult = {
        origin,
        destination,
        distanceMeters: response.route.distanceMeters,
        durationSeconds: response.route.durationSeconds,
        encodedPolyline: response.route.encodedPolyline,
        decodedPoints,
        steps: response.route.steps || [],
        calculatedAt: Date.now(),
        source: "apois_backend" as RouteSource,
        requestKey
      };

      this.validateRouteResult(result);
      this.updateCache(requestKey, result);

      return result;
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message === 'route_cancelled') {
        throw new Error('route_cancelled');
      }
      
      // Map common errors from API client to route errors
      if (error.message === 'authentication_required') throw new Error('route_authentication_required');
      if (error.message === 'geocode_timeout') throw new Error('route_timeout');
      if (error.message === 'geocode_rate_limited') throw new Error('route_rate_limited');
      
      throw error;
    } finally {
      this.activeController = null;
    }
  }

  public cancelPendingRoute(): void {
    if (this.activeController) {
      this.activeController.abort();
      this.activeController = null;
    }
  }

  public createRequestKey(origin: RouteCoordinates, destination: RouteCoordinates): string {
    // Round to 5 decimal places for normalization (approx 1.1m precision)
    const norm = (val: number) => val.toFixed(5);
    return `route:${norm(origin.lat)},${norm(origin.lng)}->${norm(destination.lat)},${norm(destination.lng)}`;
  }

  public validateRouteResult(result: RouteResult): void {
    if (result.distanceMeters <= 0 || result.durationSeconds <= 0) {
      throw new Error('route_invalid_response');
    }
    if (result.decodedPoints.length < 2) {
      throw new Error('route_invalid_polyline');
    }
  }

  private updateCache(key: string, result: RouteResult): void {
    if (this.cache.size >= ROUTE_CONFIG.CACHE_MAX_ENTRIES) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { result, timestamp: Date.now() });
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public normalizeError(error: any): RouteError {
    const message = error?.message || 'route_unknown_error';
    const code = (ROUTE_ERROR_MESSAGES[message] ? message : 'route_unknown_error');
    
    return {
      code,
      message: ROUTE_ERROR_MESSAGES[code]
    };
  }

  public dispose(): void {
    this.cancelPendingRoute();
    this.clearCache();
  }
}

export const routeService = RouteService.getInstance();
