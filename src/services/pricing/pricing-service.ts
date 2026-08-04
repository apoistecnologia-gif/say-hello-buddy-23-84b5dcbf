import { supabase } from "@/integrations/supabase/client";
import { 
  RideCategoryKey, 
  CategoryTariff, 
  FareEstimate, 
  ServiceDetails,
  FreightServiceDetails,
  TowServiceDetails,
  DeliveryServiceDetails
} from "@/types/pricing";
import { RouteData as RouteResult } from "@/hooks/use-route";

class PricingService {
  private tariffCache: Map<string, CategoryTariff> = new Map();

  async loadTariffs(): Promise<void> {
    const { data, error } = await (supabase as any).from("tariff_rules").select("*");

    if (error) {
      console.error("Error loading tariffs:", error);
      throw new Error("tariff_load_failed");
    }

    const grouped = (data || []).reduce((acc: any, rule: any) => {
      const key = rule.category_key;
      if (!acc[key]) acc[key] = {};
      acc[key][rule.field_key] = Number(rule.value);
      return acc;
    }, {});

    this.tariffCache = new Map(Object.entries(grouped) as any);
  }

  getTariff(key: string): CategoryTariff | undefined {
    return this.tariffCache.get(key);
  }

  estimateFare(
    categoryKey: string,
    route: RouteResult,
    _details: ServiceDetails
  ): FareEstimate {
    const tariff = this.getTariff(categoryKey);
    // Fallback if tariff not loaded for mock/demo
    const baseFare = tariff?.base_fare || 5.0;
    const perKm = tariff?.per_km || 2.5;
    const perMin = tariff?.per_min || 0.5;
    const minFare = tariff?.min_fare || 7.0;

    const distanceKm = route.distanceMeters / 1000;
    const durationMin = route.durationSeconds / 60;

    const distanceCost = perKm * distanceKm;
    const durationCost = perMin * durationMin;
    
    const total = Math.max(baseFare + distanceCost + durationCost, minFare);

    return {
      category_key: categoryKey,
      total: total,
      base_fare: baseFare,
      distance_fare: distanceCost,
      duration_fare: durationCost,
      min_fare: minFare
    };
  }
}

export const pricingService = new PricingService();
