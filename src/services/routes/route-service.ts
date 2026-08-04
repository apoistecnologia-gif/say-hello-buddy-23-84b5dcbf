import { apiClient } from "../api/api-client";
import { RouteRequest, RouteResponse } from "@/types/routes";

class RouteService {
  private static instance: RouteService;
  private cache: Map<string, { data: RouteResponse; timestamp: number }> = new Map();
  private abortController: AbortController | null = null;
  private readonly CACHE_TTL = 300000; // 5 minutos

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

    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    try {
      // Redireciona para o endpoint do backend standalone (Nitro)
      const response = await apiClient.post<any>('/api/passenger/routes/compute', request, {
        signal: this.abortController.signal,
        timeout: 15000
      });

      if (!response || !response.ok) {
        throw new Error(response?.error || 'Falha ao calcular rota');
      }

      const routeData = response.route as RouteResponse;
      this.cache.set(cacheKey, { data: routeData, timestamp: Date.now() });
      return routeData;
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message === 'geocode_cancelled') throw err;
      console.error("[RouteService] Error computing route via backend:", err);
      throw err;
    } finally {
      this.abortController = null;
    }
  }
}

export const routeService = RouteService.getInstance();
