import { supabase } from "@/integrations/supabase/client";
import type { ActiveRideIntermediate } from "@/types/rides/active-ride";
import type { RideHistoryItem, RideHistoryStatus } from "@/types/rides/ride-history";

const allowedStatuses = new Set<RideHistoryStatus>([
  "agendada",
  "procurar_motorista",
  "motorista_a_caminho",
  "motorista_chegou",
  "em_viagem",
  "finalizada",
  "cancelada_passageiro",
  "cancelada_motorista",
  "expired",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function readString(record: Record<string, unknown>, key: string, fallback = ""): string {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function readNullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function readNumber(record: Record<string, unknown>, key: string, fallback = 0): number {
  const value = Number(record[key]);
  return Number.isFinite(value) ? value : fallback;
}

function readNullableNumber(record: Record<string, unknown>, key: string): number | null {
  if (record[key] === null || record[key] === undefined || record[key] === "") return null;
  const value = Number(record[key]);
  return Number.isFinite(value) ? value : null;
}

function readCoordinate(
  record: Record<string, unknown>,
  key: "origin" | "destination",
): { lat: number; lng: number } {
  const parsed = parseJson(record[key]);
  if (isRecord(parsed)) {
    const lat = Number(parsed["lat"]);
    const lng = Number(parsed["lng"]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  return {
    lat: readNumber(record, `${key}_lat`),
    lng: readNumber(record, `${key}_lng`),
  };
}

function readIntermediates(value: unknown): ActiveRideIntermediate[] {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item, index) => {
      if (!isRecord(item)) return null;
      const lat = Number(item["lat"]);
      const lng = Number(item["lng"]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      const orderValue = Number(item["order"]);
      const stop: ActiveRideIntermediate = {
        lat,
        lng,
        order: Number.isFinite(orderValue) ? orderValue : index,
      };
      if (typeof item["label"] === "string" && item["label"].trim()) {
        stop.label = item["label"];
      }
      if (typeof item["address"] === "string" && item["address"].trim()) {
        stop.address = item["address"];
      }
      if (typeof item["place_id"] === "string" && item["place_id"].trim()) {
        stop.place_id = item["place_id"];
      }
      if (typeof item["source"] === "string" && item["source"].trim()) {
        stop.source = item["source"];
      }
      return stop;
    })
    .filter((item): item is ActiveRideIntermediate => item !== null)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function normalizeRide(value: unknown): RideHistoryItem {
  if (!isRecord(value)) throw new Error("invalid_ride_history_item");

  const statusValue = readString(value, "status") as RideHistoryStatus;
  if (!allowedStatuses.has(statusValue)) throw new Error("invalid_ride_status");

  const id = readString(value, "id");
  const passengerId = readString(value, "passenger_id");
  const createdAt = readString(value, "created_at");
  const updatedAt = readString(value, "updated_at", createdAt);
  if (!id || !passengerId || !createdAt) throw new Error("invalid_ride_history_item");

  return {
    id,
    passengerId,
    status: statusValue,
    category: readString(value, "category", "carros"),
    originName: readString(value, "origin_name", "Origem"),
    destinationName: readString(value, "destination_name", "Destino"),
    origin: readCoordinate(value, "origin"),
    destination: readCoordinate(value, "destination"),
    intermediates: readIntermediates(value["intermediates"]),
    estimatedPrice: readNumber(value, "estimated_price"),
    finalPrice: readNullableNumber(value, "final_price"),
    distanceKm: readNullableNumber(value, "distance_km"),
    durationMin: readNullableNumber(value, "duration_min"),
    paymentMethod: readString(value, "payment_method", "Não informado"),
    driverName: readNullableString(value, "driver_name"),
    driverRating: readNullableNumber(value, "driver_rating"),
    driverVehicleModel: readNullableString(value, "driver_vehicle_model"),
    driverVehicleColor: readNullableString(value, "driver_vehicle_color"),
    driverVehiclePlate: readNullableString(value, "driver_vehicle_plate"),
    cancellationReason: readNullableString(value, "cancellation_reason"),
    cancellationFee: readNullableNumber(value, "cancellation_fee"),
    passengerRating: readNullableNumber(value, "passenger_rating"),
    createdAt,
    acceptedAt: readNullableString(value, "accepted_at"),
    startedAt: readNullableString(value, "started_at"),
    completedAt: readNullableString(value, "completed_at"),
    cancelledAt: readNullableString(value, "cancelled_at"),
    updatedAt,
  };
}

class RideHistoryService {
  async list(passengerId: string, limit = 60): Promise<RideHistoryItem[]> {
    const { data, error } = await supabase
      .from("rides")
      .select("*")
      .eq("passenger_id", passengerId)
      .order("created_at", { ascending: false })
      .limit(Math.max(1, Math.min(limit, 100)));

    if (error) {
      console.error("[RideHistoryService] Failed to load rides", {
        code: error.code,
        message: error.message,
      });
      throw error;
    }

    return (data ?? []).map((row) => normalizeRide(row));
  }

  async getById(rideId: string, passengerId: string): Promise<RideHistoryItem> {
    const { data, error } = await supabase
      .from("rides")
      .select("*")
      .eq("id", rideId)
      .eq("passenger_id", passengerId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("ride_not_found");
    return normalizeRide(data);
  }
}

export const rideHistoryService = new RideHistoryService();
