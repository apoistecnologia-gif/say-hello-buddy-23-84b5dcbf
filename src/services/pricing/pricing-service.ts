import { activeRideService } from "@/services/rides/active-ride-service";
import { RideCategory } from "@/types/rides/ride-categories";
import { supabase } from "@/integrations/supabase/client";
import { PRICING_CONFIG } from "./pricing-config";

class PricingService {
  private static instance: PricingService;

  private constructor() {}

  public static getInstance(): PricingService {
    if (!PricingService.instance) {
      PricingService.instance = new PricingService();
    }
    return PricingService.instance;
  }

  public async estimateFare(category: RideCategory, route: any): Promise<number> {
    if (!route || !route.distanceMeters || !route.durationSeconds) return 0;

    const { data: tariff, error } = await supabase
      .from("tariff_rules" as any)
      .select("*")
      .eq("category_id", category.id)
      .single();

    if (error || !tariff) {
      console.warn(\`[Pricing] No tariff found for category \${category.key}, using defaults.\`);
      return this.calculateLocal(PRICING_CONFIG.DEFAULT_TARIFF, route);
    }

    return this.calculateLocal(tariff, route);
  }

  private calculateLocal(tariff: any, route: any): number {
    const km = route.distanceMeters / 1000;
    const min = route.durationSeconds / 60;

    const fare = tariff.base_fare + (km * tariff.per_km) + (min * tariff.per_min);
    return Math.max(fare, tariff.min_fare || 0);
  }
}

export const pricingService = PricingService.getInstance();
