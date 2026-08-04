export interface FareEstimate {
  category_key: string;
  total: number;
  base_fare: number;
  distance_fare: number;
  duration_fare: number;
  min_fare: number;
}

export interface CategoryTariff {
  base_fare: number;
  per_km: number;
  per_min: number;
  min_fare: number;
  cancel_fee: number;
}

export interface ServiceDetails {}
export interface FreightServiceDetails extends ServiceDetails {
  helpers?: number;
  heavy_items?: boolean;
  assembly?: boolean;
  floor?: number;
}
export interface TowServiceDetails extends ServiceDetails {
  vehicle_type?: string;
  is_accident?: boolean;
  is_platform?: boolean;
}
export interface DeliveryServiceDetails extends ServiceDetails {
  weight_kg?: number;
  description?: string;
}

export interface FareExtra {
  label: string;
  value: number;
}
