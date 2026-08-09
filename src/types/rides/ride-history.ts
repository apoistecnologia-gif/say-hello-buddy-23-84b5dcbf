import type { ActiveRideIntermediate, RideStatus } from "@/types/rides/active-ride";

export type RideHistoryStatus = RideStatus | "expired";
export type RideHistoryFilter = "all" | "completed" | "cancelled";

export interface RideSettlementReceipt {
  rideId: string;
  currency: string;
  grossAmount: number;
  discountAmount: number | null;
  passengerCharge: number;
  platformFee: number | null;
  driverEarning: number | null;
  paymentProviderFee: number | null;
  cashAmount: number | null;
  walletAmount: number | null;
  refundedAmount: number | null;
  paymentMethod: string;
  paymentProvider: string | null;
  paymentStatus: string;
  status: string;
  settledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

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
  passengerRating: number | null;
  settlement: RideSettlementReceipt | null;
  createdAt: string;
  acceptedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
}
