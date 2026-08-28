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

export type RideLocationSource = "gps" | "manual" | "places" | "map" | "recent";

export interface RideRequestLocation {
  lat: number;
  lng: number;
  label: string;
  address: string;
  place_id?: string | null;
  source: RideLocationSource;
}

export interface RideRequestIntermediate extends RideRequestLocation {
  order: number;
}

export interface RideRequestPayload {
  action: "create";
  request_key: string;
  origin: RideRequestLocation;
  origin_name: string;
  destination: RideRequestLocation;
  destination_name: string;
  intermediates: RideRequestIntermediate[];
  category: string;
  distance_km: number;
  duration_min: number;
  encoded_polyline?: string | null;
  client_estimated_price: number;
  payment_method: string;
  service_details: Record<string, unknown> | null;
  scheduled_for: string | null;
}

export interface RideRedispatchPayload {
  action: "redispatch";
  ride_id: string;
}

export interface RideCancelPayload {
  action: "cancel";
  ride_id: string;
  reason?: string | null;
}

export interface RideRequestResponse {
  ok: boolean;
  rideId?: string;
  candidates?: number;
  scheduled_for?: null | string;
  status?: string;
  estimated_price?: number;
  reused?: boolean;
  fee_applied?: number;
  free_seconds?: number;
  message?: string;
  error?: string;
  error_code?: string;
}
