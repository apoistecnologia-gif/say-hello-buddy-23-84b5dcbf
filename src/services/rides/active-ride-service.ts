import { supabase } from "@/integrations/supabase/client";
import {
  ActiveRide,
  RideActionAvailability,
  RideStatus,
} from "@/types/rides/active-ride";
import type { RealtimeChannel, RealtimeChannelSendResponse } from "@supabase/supabase-js";

const ACTIVE_STATUSES: RideStatus[] = [
  "procurar_motorista",
  "motorista_a_caminho",
  "motorista_chegou",
  "em_viagem",
];

const TERMINAL_STATUSES: RideStatus[] = [
  "finalizada",
  "cancelada_passageiro",
  "cancelada_motorista",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readRequiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("invalid_ride_response");
  }
  return value;
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readRequiredNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("invalid_ride_response");
  }
  return value;
}

function readOptionalNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error("invalid_ride_response");
  }
}

function readCoordinates(value: unknown): { lat: number; lng: number } {
  const parsed = parseJsonValue(value);
  if (!isRecord(parsed)) throw new Error("invalid_ride_response");

  const lat = parsed["lat"];
  const lng = parsed["lng"];
  if (
    typeof lat !== "number" ||
    !Number.isFinite(lat) ||
    typeof lng !== "number" ||
    !Number.isFinite(lng)
  ) {
    throw new Error("invalid_ride_response");
  }

  return { lat, lng };
}

function readIntermediates(value: unknown): unknown[] {
  const parsed = parseJsonValue(value);
  return Array.isArray(parsed) ? parsed : [];
}

function readStatus(value: unknown): RideStatus {
  const allowed: RideStatus[] = [
    "agendada",
    "procurar_motorista",
    "motorista_a_caminho",
    "motorista_chegou",
    "em_viagem",
    "finalizada",
    "cancelada_passageiro",
    "cancelada_motorista",
  ];

  if (typeof value === "string" && allowed.includes(value as RideStatus)) {
    return value as RideStatus;
  }

  throw new Error("invalid_ride_response");
}

class ActiveRideService {
  private static instance: ActiveRideService;
  private channel: RealtimeChannel | null = null;
  private lastUpdateTimestamp = 0;

  private constructor() {}

  public static getInstance(): ActiveRideService {
    if (!ActiveRideService.instance) {
      ActiveRideService.instance = new ActiveRideService();
    }
    return ActiveRideService.instance;
  }

  public async getRideById(rideId: string, userId: string): Promise<ActiveRide> {
    const { data, error } = await supabase
      .from("rides")
      .select("*")
      .eq("id", rideId)
      .single();

    if (error) throw error;
    if (!data) throw new Error("not_found");
    if (data.passenger_id !== userId) throw new Error("unauthorized");

    return this.normalizeRide(data);
  }

  public async getActiveRide(userId: string): Promise<ActiveRide | null> {
    const { data, error } = await supabase
      .from("rides")
      .select("*")
      .eq("passenger_id", userId)
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data ? this.normalizeRide(data) : null;
  }

  public subscribeToRide(
    rideId: string,
    onUpdate: (ride: ActiveRide) => void,
    onConnectionChange?: (connected: boolean) => void,
  ): RealtimeChannel {
    void this.unsubscribe();
    this.lastUpdateTimestamp = 0;

    this.channel = supabase
      .channel(`ride_active_${rideId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rides",
          filter: `id=eq.${rideId}`,
        },
        (payload) => {
          try {
            const updatedRide = this.normalizeRide(payload.new);
            const updateTimestamp = Date.parse(updatedRide.updated_at);
            const safeTimestamp = Number.isFinite(updateTimestamp) ? updateTimestamp : Date.now();

            if (safeTimestamp >= this.lastUpdateTimestamp) {
              this.lastUpdateTimestamp = safeTimestamp;
              onUpdate(updatedRide);
            }
          } catch (error) {
            console.error("[Realtime] Invalid ride update ignored:", error);
          }
        },
      )
      .subscribe((status) => {
        const connected = status === "SUBSCRIBED";
        onConnectionChange?.(connected);

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          console.warn(`[Realtime] Ride channel status: ${status}`);
        }
      });

    return this.channel;
  }

  public async unsubscribe(): Promise<RealtimeChannelSendResponse | void> {
    if (!this.channel) return;

    const channel = this.channel;
    this.channel = null;
    this.lastUpdateTimestamp = 0;
    return supabase.removeChannel(channel);
  }

  private normalizeRide(value: unknown): ActiveRide {
    if (!isRecord(value)) throw new Error("invalid_ride_response");
    const data = value;

    const ride: ActiveRide = {
      id: readRequiredString(data, "id"),
      passenger_id: readRequiredString(data, "passenger_id"),
      status: readStatus(data["status"]),
      category: readRequiredString(data, "category"),
      origin_name: readRequiredString(data, "origin_name"),
      destination_name: readRequiredString(data, "destination_name"),
      origin: readCoordinates(data["origin"]),
      destination: readCoordinates(data["destination"]),
      intermediates: readIntermediates(data["intermediates"]),
      estimated_price: readRequiredNumber(data, "estimated_price"),
      payment_method: readRequiredString(data, "payment_method"),
      created_at: readRequiredString(data, "created_at"),
      updated_at: readRequiredString(data, "updated_at"),
    };

    const driverId = readOptionalString(data, "driver_id");
    if (driverId) ride.driver_id = driverId;
    const encodedPolyline = readOptionalString(data, "encoded_polyline");
    if (encodedPolyline) ride.encoded_polyline = encodedPolyline;
    const driverName = readOptionalString(data, "driver_name");
    if (driverName) ride.driver_name = driverName;
    const driverPhoto = readOptionalString(data, "driver_photo");
    if (driverPhoto) ride.driver_photo = driverPhoto;
    const driverPhone = readOptionalString(data, "driver_phone");
    if (driverPhone) ride.driver_phone = driverPhone;
    const driverVehicleModel = readOptionalString(data, "driver_vehicle_model");
    if (driverVehicleModel) ride.driver_vehicle_model = driverVehicleModel;
    const driverVehicleColor = readOptionalString(data, "driver_vehicle_color");
    if (driverVehicleColor) ride.driver_vehicle_color = driverVehicleColor;
    const driverVehiclePlate = readOptionalString(data, "driver_vehicle_plate");
    if (driverVehiclePlate) ride.driver_vehicle_plate = driverVehiclePlate;
    const securityCode = readOptionalString(data, "security_code");
    if (securityCode) ride.security_code = securityCode;
    const cancellationReason = readOptionalString(data, "cancellation_reason");
    if (cancellationReason) ride.cancellation_reason = cancellationReason;
    const cancelledBy = readOptionalString(data, "cancelled_by");
    if (cancelledBy) ride.cancelled_by = cancelledBy;
    const acceptedAt = readOptionalString(data, "accepted_at");
    if (acceptedAt) ride.accepted_at = acceptedAt;
    const driverArrivedAt = readOptionalString(data, "driver_arrived_at");
    if (driverArrivedAt) ride.driver_arrived_at = driverArrivedAt;
    const startedAt = readOptionalString(data, "started_at");
    if (startedAt) ride.started_at = startedAt;
    const completedAt = readOptionalString(data, "completed_at");
    if (completedAt) ride.completed_at = completedAt;
    const shareToken = readOptionalString(data, "share_token");
    if (shareToken) ride.share_token = shareToken;

    const finalPrice = readOptionalNumber(data, "final_price");
    if (finalPrice !== undefined) ride.final_price = finalPrice;
    const driverRating = readOptionalNumber(data, "driver_rating");
    if (driverRating !== undefined) ride.driver_rating = driverRating;
    const driverLatitude = readOptionalNumber(data, "driver_latitude");
    if (driverLatitude !== undefined) ride.driver_latitude = driverLatitude;
    const driverLongitude = readOptionalNumber(data, "driver_longitude");
    if (driverLongitude !== undefined) ride.driver_longitude = driverLongitude;
    const driverHeading = readOptionalNumber(data, "driver_heading");
    if (driverHeading !== undefined) ride.driver_heading = driverHeading;
    const cancellationFee = readOptionalNumber(data, "cancellation_fee");
    if (cancellationFee !== undefined) ride.cancellation_fee = cancellationFee;
    const passengerRating = readOptionalNumber(data, "passenger_rating");
    if (passengerRating !== undefined) ride.passenger_rating = passengerRating;

    const serviceDetails = parseJsonValue(data["service_details"]);
    if (isRecord(serviceDetails)) ride.service_details = serviceDetails;

    return ride;
  }

  public getActionAvailability(status: RideStatus, ride: ActiveRide): RideActionAvailability {
    const isTerminal = TERMINAL_STATUSES.includes(status);

    return {
      canCancel: ["procurar_motorista", "motorista_a_caminho"].includes(status),
      canContactDriver:
        Boolean(ride.driver_id) &&
        ["motorista_a_caminho", "motorista_chegou", "em_viagem"].includes(status),
      canOpenSafety: ["motorista_a_caminho", "motorista_chegou", "em_viagem"].includes(status),
      canRate: status === "finalizada" && !ride.passenger_rating,
      canRequestAgain: isTerminal,
      canReturnHome: isTerminal,
      canViewReceipt: status === "finalizada",
      canShareRide: Boolean(ride.share_token) && !isTerminal,
    };
  }
}

export const activeRideService = ActiveRideService.getInstance();
