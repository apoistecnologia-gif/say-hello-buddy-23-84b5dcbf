export type LocationPermissionStatus = 
  | 'unknown' 
  | 'prompt' 
  | 'granted' 
  | 'denied' 
  | 'blocked' 
  | 'unavailable';

export type AccuracyQuality = 'high' | 'medium' | 'low' | 'none';

export interface AppLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

export type LocationErrorCode = 
  | 'permission_denied'
  | 'permission_blocked'
  | 'location_disabled'
  | 'timeout'
  | 'position_unavailable'
  | 'low_accuracy'
  | 'native_unavailable'
  | 'unknown';

export interface LocationError {
  code: LocationErrorCode;
  message: string;
}

export interface LocationState {
  permissionStatus: LocationPermissionStatus;
  currentPosition: AppLocation | null;
  lastValidPosition: AppLocation | null;
  accuracyQuality: AccuracyQuality;
  isLoading: boolean;
  isWatching: boolean;
  error: LocationError | null;
  lastUpdatedAt: number | null;
}
