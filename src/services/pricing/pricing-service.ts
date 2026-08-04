import { supabase } from "@/integrations/supabase/client";
import { PricingRequest, PricingResponse, FareEstimate } from "@/types/pricing";

class PricingService {
  private static instance: PricingService;
  private cache = new Map<string, { response: PricingResponse; timestamp: number }>();
  private CACHE_TTL = 30000; // 30 seconds cache for identical requests

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

    // Fetch categories and rules from the database to ensure backend-driven logic
    const { data: categories, error: catError } = await supabase
      .from("ride_categories")
      .select("id, code");

    if (catError) throw catError;

    const { data: rules, error: ruleError } = await supabase
      .from("tariff_rules")
      .select("*")
      .eq("is_active", true);

    if (ruleError) throw ruleError;

    const km = request.distanceMeters / 1000;
    const min = request.durationSeconds / 60;
    const stopsCount = request.stops.length;

    const estimates: FareEstimate[] = (categories || [])
      .filter(cat => !request.categoryIds || request.categoryIds.includes(cat.id))
      .map(cat => {
        const rule = rules?.find(r => r.category_id === cat.id);
        
        if (!rule) {
          return {
            categoryId: cat.id,
            available: false,
            estimatedPrice: 0,
            originalPrice: 0,
            minimumPriceApplied: false,
            pricingVersion: "v1-default",
            unavailableReason: "Sem regra tarifária",
            currency: "BRL"
          };
        }

        let price = Number(rule.base_fare) + 
                    (km * Number(rule.per_km)) + 
                    (min * Number(rule.per_min)) + 
                    (stopsCount * Number(rule.stop_fee)) + 
                    Number(rule.fixed_fee);

        price = price * (rule.dynamic_multiplier || 1);
        
        const minPriceApplied = price < Number(rule.min_fare);
        const finalPrice = Math.max(price, Number(rule.min_fare));

        return {
          categoryId: cat.id,
          available: true,
          estimatedPrice: finalPrice,
          originalPrice: finalPrice,
          minimumPriceApplied: minPriceApplied,
          estimatedPickupMinutes: Math.floor(Math.random() * 10) + 2, // Simulated ETA
          pricingVersion: rule.id,
          currency: "BRL"
        };
      });

    const response: PricingResponse = {
      currency: "BRL",
      estimates
    };

    this.cache.set(cacheKey, { response, timestamp: Date.now() });
    return response;
  }
}

export const pricingService = PricingService.getInstance();
