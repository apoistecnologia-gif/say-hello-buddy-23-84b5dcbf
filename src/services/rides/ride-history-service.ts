import { supabase } from "@/integrations/supabase/client";
import type { ActiveRideIntermediate } from "@/types/rides/active-ride";
import type {
  RideHistoryItem,
  RideHistoryStatus,
  RideSettlementReceipt,
} from "@/types/rides/ride-history";

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

interface RpcErrorLike {
  code?: string;
  message: string;
}

interface UntypedRpcClient {
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcErrorLike | null }>;
}

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

function normalizeSettlement(value: unknown): RideSettlementReceipt | null {
  if (!isRecord(value)) return null;

  const rideId = readString(value, "ride_id");
  const createdAt = readString(value, "created_at");
  const updatedAt = readString(value, "updated_at", createdAt);
  const grossAmount = readNullableNumber(value, "gross_amount");
  const passengerCharge = readNullableNumber(value, "passenger_charge");
  const paymentMethod = readString(value, "payment_method");
  const paymentStatus = readString(value, "payment_status");
  const status = readString(value, "status");

  if (
    !rideId ||
    !createdAt ||
    grossAmount === null ||
    passengerCharge === null ||
    !paymentMethod ||
    !paymentStatus ||
    !status
  ) {
    throw new Error("invalid_ride_settlement");
  }

  return {
    rideId,
    currency: readString(value, "currency", "BRL"),
    grossAmount,
    discountAmount: readNullableNumber(value, "discount_amount"),
    passengerCharge,
    platformFee: readNullableNumber(value, "platform_fee"),
    driverEarning: readNullableNumber(value, "driver_earning"),
    paymentProviderFee: readNullableNumber(value, "payment_provider_fee"),
    cashAmount: readNullableNumber(value, "cash_amount"),
    walletAmount: readNullableNumber(value, "wallet_amount"),
    refundedAmount: readNullableNumber(value, "refunded_amount"),
    paymentMethod,
    paymentProvider: readNullableString(value, "payment_provider"),
    paymentStatus,
    status,
    settledAt: readNullableString(value, "settled_at"),
    createdAt,
    updatedAt,
  };
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
    settlement: null,
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
    const normalizedRideId = rideId.trim();
    if (!normalizedRideId || !passengerId.trim()) throw new Error("ride_not_found");

    const rpcClient = supabase as unknown as UntypedRpcClient;
    const { data, error } = await rpcClient.rpc("get_passenger_ride_receipt", {
      _ride_id: normalizedRideId,
    });

    if (error) {
      console.error("[RideHistoryService] Server receipt lookup failed", {
        code: error.code,
        message: error.message,
        rideId: normalizedRideId,
      });
      throw new Error(
        error.message.toLowerCase().includes("ride_not_found")
          ? "ride_not_found"
          : "receipt_unavailable",
      );
    }

    if (!isRecord(data) || data["ok"] !== true || data["source"] !== "server") {
      throw new Error("receipt_unavailable");
    }

    const ride = normalizeRide(data["ride"]);
    if (ride.passengerId !== passengerId) throw new Error("ride_not_found");

    return {
      ...ride,
      settlement: normalizeSettlement(data["settlement"]),
    };
  }
}

export const rideHistoryService = new RideHistoryService();
