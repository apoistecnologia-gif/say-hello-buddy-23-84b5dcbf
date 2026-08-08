import type { ActiveRideIntermediate, RideStatus } from "@/types/rides/active-ride";

export type RideHistoryStatus = RideStatus | "expired";
export type RideHistoryFilter = "all" | "completed" | "cancelled";

export interface RideHistoryItem {
  id: string;
  passengerId: string;
  status: RideHistoryStatus;
  category: string;
  originName: string;
  destinationName: string;
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  intermediates: ActiveRideIntermediate[];
  estimatedPrice: number;
  finalPrice: number | null;
  distanceKm: number | null;
  durationMin: number | null;
  paymentMethod: string;
  driverName: string | null;
  driverRating: number | null;
  driverVehicleModel: string | null;
  driverVehicleColor: string | null;
  driverVehiclePlate: string | null;
  cancellationReason: string | null;
  cancellationFee: number | null;
  /** Avaliação feita pelo motorista sobre o passageiro. */
  passengerRating: number | null;
  /** Avaliação feita pelo passageiro sobre o motorista. */
  passengerDriverRating: number | null;
  createdAt: string;
  acceptedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
}
