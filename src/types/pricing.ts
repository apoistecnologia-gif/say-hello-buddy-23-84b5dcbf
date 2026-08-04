export type RideCategoryKey = "carros" | "motos" | "fretes" | "guincho" | "envios";

export interface RideCategory {
  key: RideCategoryKey;
  label: string;
  icon: string;
  description: string;
  enabled: boolean;
  order: number;
  details?: Record<string, any>;
}

export interface FareEstimate {
  category: RideCategoryKey;
  baseFare: number;
  perKm: number;
  perMin: number;
  distanceKm: number;
  durationMin: number;
  extrasTotal: number;
  minFare: number;
  estimatedTotal: number;
}
