export type RideCategoryKey = "carros" | "motos" | "fretes" | "guincho" | "envios";

export interface RideCategory {
  id: string;
  key: RideCategoryKey;
  label: string;
  icon: string;
  color: string;
  enabled: boolean;
  sort_order: number;
}

export interface TariffRule {
  id: string;
  category_key: RideCategoryKey;
  field_key: string;
  value: number;
}

export interface CategoryTariff {
  base_fare: number;
  min_fare: number;
  per_km: number;
  per_min: number;
  // Extras
  call_out_fee?: number;
  helper1_fee?: number;
  helper2_fee?: number;
  heavy_furniture_fee?: number;
  assembly_fee?: number;
  packing_fee?: number;
  difficult_access_fee?: number;
  stair_fee?: number;
  heavy_vehicle_fee?: number;
  accident_fee?: number;
  platform_fee?: number;
  locked_wheels_fee?: number;
  garage_fee?: number;
  per_kg?: number;
  max_weight_kg?: number;
  // Multipliers (modeled for future use)
  night_multiplier?: number;
  peak_multiplier?: number;
  night_fee?: number;
}

export interface FareExtra {
  label: string;
  value: number;
  key: string;
}

export interface FareBreakdown {
  base: number;
  distance: number;
  duration: number;
  extras: FareExtra[];
  subtotal: number;
  isMinFare: boolean;
}

export interface FareEstimate {
  total: number;
  breakdown: FareBreakdown;
  categoryKey: RideCategoryKey;
  calculatedAt: Date;
  isStale: boolean;
}

export interface FreightServiceDetails {
  tipo: "frete" | "mudança";
  ajudantes: 0 | 1 | 2;
  itemPesado: boolean;
  montagem: boolean;
  embalagem: boolean;
  retirada: {
    dificilAcesso: boolean;
    escadas: boolean;
    andar: number;
    elevador: boolean;
  };
  entrega: {
    dificilAcesso: boolean;
    escadas: boolean;
    andar: number;
    elevador: boolean;
  };
}

export interface TowServiceDetails {
  tipoVeiculo: "carro" | "moto" | "utilitario" | "caminhonete";
  acidente: boolean;
  precisaPlataforma: boolean;
  rodasTravadas: boolean;
  garagemSubsolo: boolean;
  dificilAcesso: boolean;
}

export interface DeliveryServiceDetails {
  weightKg: number;
}

export type ServiceDetails = FreightServiceDetails | TowServiceDetails | DeliveryServiceDetails | null;

export type PricingStatus = "idle" | "loading" | "success" | "failed" | "unavailable";

export type PricingError = 
  | "categories_load_failed"
  | "categories_empty"
  | "category_disabled"
  | "tariff_load_failed"
  | "tariff_missing"
  | "tariff_invalid"
  | "route_required"
  | "invalid_distance"
  | "invalid_duration"
  | "invalid_service_details"
  | "service_weight_exceeds_limit"
  | "pricing_unavailable"
  | "pricing_unknown_error";
