export interface RouteCoordinates {
  lat: number;
  lng: number;
}

export interface RouteRequest {
  origin: RouteCoordinates;
  destination: RouteCoordinates;
  intermediates?: RouteCoordinates[] | undefined;
}

export interface RouteStep {
  lat: number;
  lng: number;
  distanceMeters: number;
  instruction: string;
  maneuver: string | undefined;
}

export interface RouteResponse {
  ok: boolean;
  route: {
    distanceMeters: number;
    durationSeconds: number;
    encodedPolyline: string;
    steps: RouteStep[];
  };
}

export type RouteSource = "apois_backend";

export interface RouteResult {
  origin: RouteCoordinates;
  destination: RouteCoordinates;
  intermediates?: RouteCoordinates[] | undefined;
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string;
  decodedPoints: RouteCoordinates[];
  steps: RouteStep[];
  calculatedAt: number;
  source: RouteSource;
  requestKey: string;
}

export type RouteStatus = 
  | 'idle' 
  | 'loading' 
  | 'success' 
  | 'failed' 
  | 'debouncing' 
  | 'stale';

export interface RouteError {
  code: string;
  message: string;
}
