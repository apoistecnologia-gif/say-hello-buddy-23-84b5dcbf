import { supabase } from "@/integrations/supabase/client";
import { 
  RideCategoryKey, 
  CategoryTariff, 
  FareEstimate, 
  ServiceDetails,
  FreightServiceDetails,
  TowServiceDetails,
  DeliveryServiceDetails,
  FareExtra
} from "@/types/pricing";
import { RouteResult } from "@/types/routes";

class PricingService {
  private tariffCache: Map<RideCategoryKey, CategoryTariff> = new Map();

  async loadTariffs(): Promise<void> {
    // Usando cast para any para evitar erros de tipo quando o schema local não está sincronizado com tabelas dinâmicas
    const { data, error } = await (supabase as any).from("tariff_rules")
      .select("*");

    if (error) {
      console.error("Error loading tariffs:", error);
      throw new Error("tariff_load_failed");
    }

    const grouped = (data || []).reduce((acc: any, rule: any) => {
      const key = rule.category_key as RideCategoryKey;
      if (!acc[key]) acc[key] = {} as CategoryTariff;
      acc[key][rule.field_key] = Number(rule.value);
      return acc;
    }, {} as Record<RideCategoryKey, CategoryTariff>);

    this.tariffCache = new Map(Object.entries(grouped) as [RideCategoryKey, CategoryTariff][]);
  }

  getTariff(key: RideCategoryKey): CategoryTariff | undefined {
    return this.tariffCache.get(key);
  }

  estimateFare(
    categoryKey: RideCategoryKey,
    route: RouteResult,
    details: ServiceDetails
  ): FareEstimate {
    const tariff = this.getTariff(categoryKey);
    if (!tariff) throw new Error("tariff_missing");

    const distanceKm = route.distanceMeters / 1000;
    const durationMin = route.durationSeconds / 60;

    let baseFare = tariff.base_fare || 0;
    if (categoryKey === "guincho" && tariff.call_out_fee) {
      baseFare = tariff.call_out_fee;
    }

    const distanceCost = (tariff.per_km || 0) * distanceKm;
    const durationCost = (tariff.per_min || 0) * durationMin;
    
    let extras: FareExtra[] = [];
    if (categoryKey === "fretes") {
      extras = this.calculateFreightExtras(tariff, details as FreightServiceDetails);
    } else if (categoryKey === "guincho") {
      extras = this.calculateTowExtras(tariff, details as TowServiceDetails);
    } else if (categoryKey === "envios") {
      extras = this.calculateDeliveryExtras(tariff, details as DeliveryServiceDetails);
    }

    const extrasTotal = extras.reduce((sum, e) => sum + e.value, 0);
    const rawTotal = baseFare + distanceCost + durationCost + extrasTotal;
    
    const minFare = tariff.min_fare || 0;
    const isMinFare = rawTotal < minFare;
    const finalTotal = Math.max(rawTotal, minFare);

    return {
      total: finalTotal,
      categoryKey,
      calculatedAt: new Date(),
      isStale: false,
      breakdown: {
        base: baseFare,
        distance: distanceCost,
        duration: durationCost,
        extras,
        subtotal: finalTotal,
        isMinFare
      }
    };
  }

  private calculateFreightExtras(tariff: CategoryTariff, details: FreightServiceDetails): FareExtra[] {
    const extras: FareExtra[] = [];
    if (!details) return extras;

    if (details.ajudantes >= 1 && tariff.helper1_fee) {
      extras.push({ label: "1 Ajudante", value: tariff.helper1_fee, key: "helper1_fee" });
    }
    if (details.ajudantes === 2 && tariff.helper2_fee) {
      extras.push({ label: "2º Ajudante", value: tariff.helper2_fee, key: "helper2_fee" });
    }
    if (details.itemPesado && tariff.heavy_furniture_fee) {
      extras.push({ label: "Item Pesado", value: tariff.heavy_furniture_fee, key: "heavy_furniture_fee" });
    }
    if (details.montagem && tariff.assembly_fee) {
      extras.push({ label: "Montagem", value: tariff.assembly_fee, key: "assembly_fee" });
    }
    if (details.embalagem && tariff.packing_fee) {
      extras.push({ label: "Embalagem", value: tariff.packing_fee, key: "packing_fee" });
    }
    
    const diffAccess = (details.retirada.dificilAcesso ? 1 : 0) + (details.entrega.dificilAcesso ? 1 : 0);
    if (diffAccess > 0 && tariff.difficult_access_fee) {
      extras.push({ label: "Acesso Difícil", value: tariff.difficult_access_fee * diffAccess, key: "difficult_access_fee" });
    }

    if (tariff.stair_fee) {
      let stairCost = 0;
      if (details.retirada.escadas && !details.retirada.elevador) {
        stairCost += details.retirada.andar * tariff.stair_fee;
      }
      if (details.entrega.escadas && !details.entrega.elevador) {
        stairCost += details.entrega.andar * tariff.stair_fee;
      }
      if (stairCost > 0) {
        extras.push({ label: "Escadas", value: stairCost, key: "stair_fee" });
      }
    }

    return extras;
  }

  private calculateTowExtras(tariff: CategoryTariff, details: TowServiceDetails): FareExtra[] {
    const extras: FareExtra[] = [];
    if (!details) return extras;

    if ((details.tipoVeiculo === "utilitario" || details.tipoVeiculo === "caminhonete") && tariff.heavy_vehicle_fee) {
      extras.push({ label: "Veículo Pesado", value: tariff.heavy_vehicle_fee, key: "heavy_vehicle_fee" });
    }
    if (details.acidente && tariff.accident_fee) {
      extras.push({ label: "Acidente", value: tariff.accident_fee, key: "accident_fee" });
    }
    if (details.precisaPlataforma && tariff.platform_fee) {
      extras.push({ label: "Plataforma", value: tariff.platform_fee, key: "platform_fee" });
    }
    if (details.rodasTravadas && tariff.locked_wheels_fee) {
      extras.push({ label: "Rodas Travadas", value: tariff.locked_wheels_fee, key: "locked_wheels_fee" });
    }
    if (details.garagemSubsolo && tariff.garage_fee) {
      extras.push({ label: "Garagem/Subsolo", value: tariff.garage_fee, key: "garage_fee" });
    }
    if (details.dificilAcesso && tariff.difficult_access_fee) {
      extras.push({ label: "Acesso Difícil", value: tariff.difficult_access_fee, key: "difficult_access_fee" });
    }

    return extras;
  }

  private calculateDeliveryExtras(tariff: CategoryTariff, details: DeliveryServiceDetails): FareExtra[] {
    const extras: FareExtra[] = [];
    if (!details) return extras;

    if (tariff.max_weight_kg && details.weightKg > tariff.max_weight_kg) {
      throw new Error("service_weight_exceeds_limit");
    }

    if (details.weightKg > 0 && tariff.per_kg) {
      extras.push({ label: "Peso", value: details.weightKg * tariff.per_kg, key: "per_kg" });
    }

    return extras;
  }

  clearCache() {
    this.tariffCache.clear();
  }
}

export const pricingService = new PricingService();
