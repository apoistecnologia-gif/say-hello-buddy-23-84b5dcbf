import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel, RealtimeChannelSendResponse } from "@supabase/supabase-js";
import type {
  ActiveRide,
  ActiveRideIntermediate,
  RideActionAvailability,
  RideStatus,
} from "@/types/rides/active-ride";

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

const STATUS_ORDER: Record<RideStatus, number> = {
  agendada: 0,
  procurar_motorista: 1,
  motorista_a_caminho: 2,
  motorista_chegou: 3,
  em_viagem: 4,
  finalizada: 5,
  cancelada_passageiro: 5,
  cancelada_motorista: 5,
};

type OptionalStringRideKey =
  | "driver_id"
  | "encoded_polyline"
  | "driver_name"
  | "driver_photo"
  | "driver_phone"
  | "driver_vehicle_model"
  | "driver_vehicle_color"
  | "driver_vehicle_plate"
  | "security_code"
  | "cancellation_reason"
  | "cancelled_by"
  | "accepted_at"
  | "driver_arrived_at"
  | "started_at"
  | "completed_at"
  | "share_token"
  | "queued_after_ride_id"
  | "queued_at";

type OptionalNumberRideKey =
  | "final_price"
  | "distance_km"
  | "duration_min"
  | "driver_rating"
  | "driver_latitude"
  | "driver_longitude"
  | "driver_heading"
  | "cancellation_fee"
  | "passenger_rating";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readRequiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) throw new Error("invalid_ride_response");
  return value;
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readRequiredNumber(record: Record<string, unknown>, key: string): number {
  const value = toFiniteNumber(record[key]);
  if (value === null) throw new Error("invalid_ride_response");
  return value;
}

function readOptionalNumber(record: Record<string, unknown>, key: string): number | undefined {
  return toFiniteNumber(record[key]) ?? undefined;
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error("invalid_ride_response");
  }
}

function readCoordinatesValue(value: unknown): { lat: number; lng: number } | null {
  const parsed = parseJsonValue(value);
  if (!isRecord(parsed)) return null;

  const lat = toFiniteNumber(parsed["lat"]);
  const lng = toFiniteNumber(parsed["lng"]);
  if (lat === null || lng === null) return null;
  return { lat, lng };
}

function readRideCoordinates(
  record: Record<string, unknown>,
  jsonKey: "origin" | "destination",
): { lat: number; lng: number } {
  const fromJson = readCoordinatesValue(record[jsonKey]);
  if (fromJson) return fromJson;

  const lat = toFiniteNumber(record[`${jsonKey}_lat`]);
  const lng = toFiniteNumber(record[`${jsonKey}_lng`]);
  if (lat !== null && lng !== null) return { lat, lng };

  throw new Error("invalid_ride_response");
}

function readIntermediates(value: unknown): ActiveRideIntermediate[] {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const lat = toFiniteNumber(item["lat"]);
    const lng = toFiniteNumber(item["lng"]);
    if (lat === null || lng === null) return [];

    const intermediate: ActiveRideIntermediate = { lat, lng, order: index };
    const optionalStrings = ["label", "address", "place_id", "source"] as const;
    for (const key of optionalStrings) {
      const field = item[key];
      if (typeof field === "string" && field.trim()) intermediate[key] = field;
    }
    const order = toFiniteNumber(item["order"]);
    if (order !== null) intermediate.order = Math.max(0, Math.floor(order));
    return [intermediate];
  });
}

function readStatus(value: unknown): RideStatus {
  const allowed = Object.keys(STATUS_ORDER) as RideStatus[];
  if (typeof value === "string" && allowed.includes(value as RideStatus)) {
    return value as RideStatus;
  }
  throw new Error("invalid_ride_response");
}

class ActiveRideService {
  private static instance: ActiveRideService;
  private channel: RealtimeChannel | null = null;
  private lastUpdateTimestamp = 0;
  private lastStatus: RideStatus | null = null;

  private constructor() {}

  public static getInstance(): ActiveRideService {
    if (!ActiveRideService.instance) ActiveRideService.instance = new ActiveRideService();
    return ActiveRideService.instance;
  }

  public async getRideById(rideId: string, passengerId: string): Promise<ActiveRide> {
    const { data, error } = await supabase
      .from("rides")
      .select("*")
      .eq("id", rideId)
      .eq("passenger_id", passengerId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("not_found");
    return this.normalizeRide(data);
  }

  public async getActiveRide(passengerId: string): Promise<ActiveRide | null> {
    const { data, error } = await supabase
      .from("rides")
      .select("*")
      .eq("passenger_id", passengerId)
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
    this.lastStatus = null;

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
            if (updatedRide.id !== rideId) return;

            const parsedTimestamp = Date.parse(updatedRide.updated_at);
            const updateTimestamp = Number.isFinite(parsedTimestamp) ? parsedTimestamp : Date.now();
            const isNewer = updateTimestamp > this.lastUpdateTimestamp;
            const isSameUpdate = updateTimestamp === this.lastUpdateTimestamp;
            const isForwardTransition =
              !this.lastStatus || STATUS_ORDER[updatedRide.status] >= STATUS_ORDER[this.lastStatus];

            if (isNewer || (isSameUpdate && isForwardTransition)) {
              this.lastUpdateTimestamp = updateTimestamp;
              this.lastStatus = updatedRide.status;
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
    this.lastStatus = null;
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
      origin: readRideCoordinates(data, "origin"),
      destination: readRideCoordinates(data, "destination"),
      intermediates: readIntermediates(data["intermediates"]),
      estimated_price: readRequiredNumber(data, "estimated_price"),
      payment_method: readRequiredString(data, "payment_method"),
      created_at: readRequiredString(data, "created_at"),
      updated_at: readRequiredString(data, "updated_at"),
    };

    const optionalStrings: Array<[OptionalStringRideKey, string]> = [
      ["driver_id", "driver_id"],
      ["encoded_polyline", "encoded_polyline"],
      ["driver_name", "driver_name"],
      ["driver_photo", "driver_photo"],
      ["driver_phone", "driver_phone"],
      ["driver_vehicle_model", "driver_vehicle_model"],
      ["driver_vehicle_color", "driver_vehicle_color"],
      ["driver_vehicle_plate", "driver_vehicle_plate"],
      ["security_code", "security_code"],
      ["cancellation_reason", "cancellation_reason"],
      ["cancelled_by", "cancelled_by"],
      ["accepted_at", "accepted_at"],
      ["driver_arrived_at", "driver_arrived_at"],
      ["started_at", "started_at"],
      ["completed_at", "completed_at"],
      ["share_token", "share_token"],
      ["queued_after_ride_id", "queued_after_ride_id"],
      ["queued_at", "queued_at"],
    ];

    for (const [targetKey, sourceKey] of optionalStrings) {
      const field = readOptionalString(data, sourceKey);
      if (field !== undefined) ride[targetKey] = field;
    }

    const optionalNumbers: Array<[OptionalNumberRideKey, string]> = [
      ["final_price", "final_price"],
      ["distance_km", "distance_km"],
      ["duration_min", "duration_min"],
      ["driver_rating", "driver_rating"],
      ["driver_latitude", "driver_latitude"],
      ["driver_longitude", "driver_longitude"],
      ["driver_heading", "driver_heading"],
      ["cancellation_fee", "cancellation_fee"],
      ["passenger_rating", "passenger_rating"],
    ];

    for (const [targetKey, sourceKey] of optionalNumbers) {
      const field = readOptionalNumber(data, sourceKey);
      if (field !== undefined) ride[targetKey] = field;
    }

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
        (["motorista_a_caminho", "motorista_chegou", "em_viagem"].includes(status) ||
          (status === "procurar_motorista" && Boolean(ride.queued_after_ride_id))),
      canOpenSafety: ["motorista_a_caminho", "motorista_chegou", "em_viagem"].includes(status),
      canRate: status === "finalizada" && ride.passenger_rating === undefined,
      canRequestAgain: isTerminal,
      canReturnHome: isTerminal,
      canViewReceipt: status === "finalizada",
      canShareRide: Boolean(ride.share_token) && !isTerminal,
    };
  }
}

export const activeRideService = ActiveRideService.getInstance();
