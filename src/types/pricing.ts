import { Database } from "@/integrations/supabase/client";

export type RideCategoryCode = "carro" | "moto" | "fretes" | "guincho" | "envios";

export interface RideCategory {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  imageUrl?: string | null;
  isActive: boolean;
  sortOrder: number;
  capacityLabel?: string | null;
  etaLabel?: string | null;
}

export interface FareEstimate {
  categoryId: string;
  available: boolean;
  estimatedPrice: number;
  originalPrice: number;
  minimumPriceApplied: boolean;
  estimatedPickupMinutes?: number;
  pricingVersion: string;
  unavailableReason?: string | null;
  currency: string;
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
