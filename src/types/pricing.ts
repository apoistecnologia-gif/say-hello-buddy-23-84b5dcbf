export type RideCategoryCode = "carro" | "moto" | "fretes" | "guincho" | "envios";
export type RideCategoryKey = RideCategoryCode;

export interface RideCategory {
  id: string;
  code: string;
  key: RideCategoryCode; // Added for compatibility
  name: string;
  label: string; // Added for compatibility
  description?: string | null;
  icon?: string | null;
  imageUrl?: string | null;
  isActive: boolean;
  sortOrder: number;
  capacityLabel?: string | null;
  etaLabel?: string | null;
  details?: any; // Added for compatibility
}

export interface FareEstimate {
  categoryId: string;
  category_key?: string; // Added for compatibility
  available: boolean;
  estimatedPrice: number;
  total?: number; // Added for compatibility
  originalPrice: number;
  minimumPriceApplied: boolean;
  estimatedPickupMinutes?: number;
  pricingVersion: string;
  unavailableReason?: string | null;
  extrasTotal?: number; // Added for compatibility
  base_fare?: number;
  distance_fare?: number;
  duration_fare?: number;
  min_fare?: number;
}

export interface PricingRequest {
  routeId?: string;
  origin: {
    latitude: number;
    longitude: number;
  };
  destination: {
    latitude: number;
    longitude: number;
  };
  stops: {
    latitude: number;
    longitude: number;
  }[];
  distanceMeters: number;
  durationSeconds: number;
  categoryIds?: string[];
}

export interface PricingResponse {
  currency: string;
  estimates: FareEstimate[];
}

export interface ServiceDetails {}
export interface FareExtra {
  label: string;
  value: number;
}
