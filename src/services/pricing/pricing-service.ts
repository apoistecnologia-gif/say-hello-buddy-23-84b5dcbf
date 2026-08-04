import { supabase } from "@/integrations/supabase/client";
import { PricingRequest, PricingResponse, FareEstimate } from "@/types/pricing";

class PricingService {
  private static instance: PricingService;
  private cache = new Map<string, { response: PricingResponse; timestamp: number }>();
  private CACHE_TTL = 30000; // 30 seconds cache

  private constructor() {}

  public static getInstance(): PricingService {
    if (!PricingService.instance) {
      PricingService.instance = new PricingService();
    }
    return PricingService.instance;
  }

  public async estimateFares(request: PricingRequest): Promise<PricingResponse> {
    const cacheKey = JSON.stringify(request);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.response;
    }

    try {
      const { data: response, error } = await supabase.functions.invoke(
        "passenger-pricing-estimate",
        {
          body: request,
        },
      );

      if (error || !response || !response.ok) {
        throw new Error(error?.message || response?.error || "Erro ao obter estimativa");
      }

      const pricingResponse: PricingResponse = {
        currency: response.currency || "BRL",
        estimates: response.estimates.map((est: any) => ({
          ...est,
          pricingVersion: est.pricingVersion || "backend-v1",
        })),
      };

      this.cache.set(cacheKey, { response: pricingResponse, timestamp: Date.now() });
      return pricingResponse;
    } catch (error) {
      console.error("[PricingService] Error estimating fares via backend:", error);
      throw error;
    }
  }
}

export const pricingService = PricingService.getInstance();
