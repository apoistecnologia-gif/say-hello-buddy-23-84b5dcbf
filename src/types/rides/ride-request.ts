export type RideRequestStatus = 
  | "idle" 
  | "reviewing" 
  | "validating" 
  | "submitting" 
  | "success" 
  | "reused" 
  | "blocked" 
  | "timeout_unknown" 
  | "network_error" 
  | "failed";

export interface RideRequestPayload {
  action: "create";
  request_key: string;
  origin: {
    lat: number;
    lng: number;
  };
  origin_name: string;
  destination: {
    lat: number;
    lng: number;
  };
  destination_name: string;
  category: string;
  distance_km?: number | null;
  duration_min?: number | null;
  estimated_price?: number | null;
  pickup_label?: string | null;
  pickup_short_label?: string | null;
  pickup_address?: string | null;
  pickup_place_id?: string | null;
  pickup_source?: "gps" | "manual" | "places" | null;
  payment_method?: string | null;
  service_details?: Record<string, unknown> | null;
  scheduled_for?: null;
}

export interface RideRequestResponse {
  ok: boolean;
  rideId?: string;
  candidates?: number;
  scheduled_for?: null | string;
  status?: string;
  estimated_price?: number;
  reused?: boolean;
  message?: string;
  error_code?: string;
}
