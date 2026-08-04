export type RideStatus =
  | "agendada"
  | "procurar_motorista"
  | "motorista_a_caminho"
  | "motorista_chegou"
  | "em_viagem"
  | "finalizada"
  | "cancelada_passageiro"
  | "cancelada_motorista";

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
  intermediates?: any[];
  estimated_price: number;
  final_price?: number;
  payment_method: string;
  service_details?: any;
  encoded_polyline?: string;

  // Driver Info (Snapshots from ride or joined)
  driver_name?: string;
  driver_photo?: string;
  driver_rating?: number;
  driver_phone?: string;

  // Vehicle Info
  driver_vehicle_model?: string;
  driver_vehicle_color?: string;
  driver_vehicle_plate?: string;

  // Driver Realtime Location
  driver_latitude?: number;
  driver_longitude?: number;
  driver_heading?: number;

  // Security
  security_code?: string;

  // Cancellation
  cancellation_reason?: string;
  cancelled_by?: string;
  cancellation_fee?: number;

  // Timeline
  created_at: string;
  accepted_at?: string;
  driver_arrived_at?: string;
  started_at?: string;
  completed_at?: string;
  updated_at: string;

  // Extras
  share_token?: string;
  passenger_rating?: number;
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
