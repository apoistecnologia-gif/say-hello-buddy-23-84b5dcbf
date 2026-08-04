import { supabase } from "@/integrations/supabase/client";
import { RouteRequest, RouteResponse } from "@/types/routes";

// Tipagens movidas para @/types/routes.ts

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
      const { data, error } = await supabase.functions.invoke("compute-route", {
        body: request,
        headers: {
          "X-Client-Timeout": "15000"
        }
      });

      if (error) {
        if (error.status === 401) throw new Error("Não autenticado");
        if (error.status === 403) throw new Error("Sem permissão para passageiro");
        if (error.status === 429) throw new Error("Muitas requisições. Tente mais tarde.");
        throw error;
      }

      const response = data as RouteResponse;
      this.cache.set(cacheKey, { data: response, timestamp: Date.now() });
      return response;
    } catch (err: any) {
      if (err.name === 'AbortError') throw err;
      console.error("[RouteService] Error computing route:", err);
      throw err;
    } finally {
      this.abortController = null;
    }
  }
}

export const routeService = RouteService.getInstance();
