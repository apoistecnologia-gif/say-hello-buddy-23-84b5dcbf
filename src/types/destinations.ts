import { DestinationAddress } from "./places";

export interface DestinationHistoryItem extends DestinationAddress {
  id: string;
  createdAt: string;
  updatedAt: string;
  favorite: boolean;
  icon?: FavoriteIconType;
  nickname?: string;
}

export type FavoriteIconType =
  | "home"
  | "briefcase"
  | "heart"
  | "star"
  | "map-pin"
  | "building"
  | "hospital"
  | "shopping-cart"
  | "graduation-cap"
  | "custom";

export interface PlacesSearchState {
  query: string;
  suggestions: any[];
  status: string;
  isLoading: boolean;
  error: any | null;
}
