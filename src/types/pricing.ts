export type RideCategoryCode = "carros" | "motos" | "fretes" | "guincho" | "envios";
export type RideCategoryKey = RideCategoryCode;

export interface RideCategory {
  id: string;
  code: RideCategoryCode;
  key: RideCategoryCode;
  name: string;
  label: string;
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
  category_key?: string;
  available: boolean;
  estimatedPrice: number;
  total?: number;
  originalPrice: number;
  minimumPriceApplied: boolean;
  estimatedPickupMinutes?: number;
  pricingVersion: string;
  unavailableReason?: string | null;
  extrasTotal?: number;
  base_fare?: number;
  distance_fare?: number;
  duration_fare?: number;
  min_fare?: number;
  pixProcessingFee?: number;
  pixPassengerTotal?: number;
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
  serviceDetails?: ServiceDetails;
  city?: string;
}

export interface PricingResponse {
  currency: string;
  estimates: FareEstimate[];
}

export interface FreightAccessDetails {
  andar?: number;
  elevador?: boolean;
  escadas?: boolean;
  dificilAcesso?: boolean;
}

export interface FreightServiceDetails {
  tipoServico: "frete" | "mudanca";
  ajudantes: "nenhum" | "um" | "dois";
  itemPesado: boolean;
  desmontar: boolean;
  embalar: boolean;
  retirada: FreightAccessDetails;
  entrega: FreightAccessDetails;
  observacoes?: string;
}

export interface TowServiceDetails {
  tipoVeiculo: "moto" | "carro" | "utilitario" | "caminhonete";
  veiculoLiga: boolean;
  acidente: boolean;
  rodasTravadas: boolean;
  precisaPlataforma: boolean;
  dificilAcesso: boolean;
  garagemSubsolo: boolean;
  observacoes?: string;
}

export interface DeliveryServiceDetails {
  tipoItem: "documento" | "pacote" | "comida" | "outro";
  weightKg: number;
  fragil: boolean;
  nomeDestinatario: string;
  telefoneDestinatario: string;
  observacoes?: string;
}

export type ServiceDetails = Record<string, unknown>;

export interface FareExtra {
  label: string;
  value: number;
}
