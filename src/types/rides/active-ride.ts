export type RideStatus =
  | "agendada"
  | "aguardando_pagamento"
  | "procurar_motorista"
  | "motorista_a_caminho"
  | "motorista_chegou"
  | "em_viagem"
  | "finalizada"
  | "cancelada_passageiro"
  | "cancelada_motorista"
  | "expired";

export interface RideDriverLocation {
  lat: number;
  lng: number;
  heading?: number;
  updated_at: string;
}

export interface RideDriver {
  id: string;
  name: string;
  photo?: string;
  rating?: number;
  phone?: string;
  total_rides?: number;
}

export interface RideVehicle {
  model: string;
  color: string;
  plate: string;
}

export interface ActiveRideIntermediate {
  lat: number;
  lng: number;
  label?: string;
  address?: string;
  place_id?: string;
  source?: string;
  order?: number;
}

export interface ActiveRide {
  id: string;
  passenger_id: string;
  driver_id?: string;
  status: RideStatus;
  category: string;
  origin_name: string;
  destination_name: string;
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  intermediates?: ActiveRideIntermediate[];
  estimated_price: number;
  final_price?: number;
  distance_km?: number;
  duration_min?: number;
  payment_method: string;
  payment_status?: string;
  payment_provider?: string;
  service_details?: Record<string, unknown>;
  encoded_polyline?: string;
  scheduled_for?: string;

  driver_name?: string;
  driver_photo?: string;
  driver_rating?: number;
  driver_phone?: string;

  driver_vehicle_model?: string;
  driver_vehicle_color?: string;
  driver_vehicle_plate?: string;

  driver_latitude?: number;
  driver_longitude?: number;
  driver_heading?: number;

  security_code?: string;

  /**
   * Quando preenchido com status procurar_motorista + driver_id, a corrida já
   * foi reservada por um motorista que está finalizando outra viagem próxima.
   * Ela só muda para motorista_a_caminho ao terminar a corrida anterior.
   */
  queued_after_ride_id?: string;
  queued_at?: string;

  cancellation_reason?: string;
  cancelled_by?: string;
  cancellation_fee?: number;

  created_at: string;
  accepted_at?: string;
  driver_arrived_at?: string;
  started_at?: string;
  completed_at?: string;
  updated_at: string;

  share_token?: string;
  share_expires_at?: string;
  share_revoked_at?: string;

  /** Avaliação feita pelo motorista sobre o passageiro. */
  passenger_rating?: number;
  /** Avaliação feita pelo passageiro sobre o motorista. */
  passenger_driver_rating?: number;
}

export type RideScreenState =
  | "idle"
  | "loading"
  | "active"
  | "reconnecting"
  | "completed"
  | "cancelled"
  | "not_found"
  | "unauthorized"
  | "network_error"
  | "realtime_error"
  | "failed";

export interface RideActionAvailability {
  canCancel: boolean;
  canContactDriver: boolean;
  canOpenSafety: boolean;
  canRate: boolean;
  canRequestAgain: boolean;
  canReturnHome: boolean;
  canViewReceipt: boolean;
  canShareRide: boolean;
}

export interface RideError {
  code: string;
  message: string;
}
