export type RideStopId = string;

export interface RideStop {
  id: RideStopId;
  placeId: string;
  latitude: number;
  longitude: number;
  label: string;
  subLabel: string;
  formattedAddress: string;
  order: number;
  source: "google_places" | "favorites" | "recent";
  createdAt: string;
  updatedAt: string;
}

export interface RideStopsState {
  stops: RideStop[];
  isEditing: boolean;
  limit: number;
}

export interface RideStopsError {
  code:
    | "limit_reached"
    | "duplicate_place"
    | "invalid_coordinates"
    | "origin_duplicate"
    | "destination_duplicate"
    | "empty_place";
  message: string;
}
