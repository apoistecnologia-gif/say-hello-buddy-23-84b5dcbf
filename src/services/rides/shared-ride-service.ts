import { supabase } from "@/integrations/supabase/client";

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

export type SharedRideStatus =
  | "procurar_motorista"
  | "motorista_a_caminho"
  | "motorista_chegou"
  | "em_viagem"
  | "finalizada"
  | "cancelada_passageiro"
  | "cancelada_motorista";

export interface SharedRideSnapshot {
  status: SharedRideStatus;
  category: string;
  originName: string;
  destinationName: string;
  driverName: string | null;
  driverVehicleModel: string | null;
  driverVehicleColor: string | null;
  driverVehiclePlate: string | null;
  driverLatitude: number | null;
  driverLongitude: number | null;
  driverHeading: number | null;
  createdAt: string;
  acceptedAt: string | null;
  driverArrivedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

const ALLOWED_STATUSES = new Set<SharedRideStatus>([
  "procurar_motorista",
  "motorista_a_caminho",
  "motorista_chegou",
  "em_viagem",
  "finalizada",
  "cancelada_passageiro",
  "cancelada_motorista",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) throw new Error("shared_ride_invalid");
  return value;
}

function readNullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function readNullableNumber(record: Record<string, unknown>, key: string): number | null {
  if (record[key] === null || record[key] === undefined || record[key] === "") return null;
  const parsed = Number(record[key]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSnapshot(value: unknown): SharedRideSnapshot {
  if (!isRecord(value)) throw new Error("shared_ride_invalid");

  const status = readString(value, "status") as SharedRideStatus;
  if (!ALLOWED_STATUSES.has(status)) throw new Error("shared_ride_invalid");

  return {
    status,
    category: readString(value, "category"),
    originName: readString(value, "origin_name"),
    destinationName: readString(value, "destination_name"),
    driverName: readNullableString(value, "driver_name"),
    driverVehicleModel: readNullableString(value, "driver_vehicle_model"),
    driverVehicleColor: readNullableString(value, "driver_vehicle_color"),
    driverVehiclePlate: readNullableString(value, "driver_vehicle_plate"),
    driverLatitude: readNullableNumber(value, "driver_latitude"),
    driverLongitude: readNullableNumber(value, "driver_longitude"),
    driverHeading: readNullableNumber(value, "driver_heading"),
    createdAt: readString(value, "created_at"),
    acceptedAt: readNullableString(value, "accepted_at"),
    driverArrivedAt: readNullableString(value, "driver_arrived_at"),
    startedAt: readNullableString(value, "started_at"),
    completedAt: readNullableString(value, "completed_at"),
    updatedAt: readString(value, "updated_at"),
  };
}

class SharedRideService {
  async getByToken(token: string): Promise<SharedRideSnapshot> {
    const normalizedToken = token.trim();
    if (normalizedToken.length < 16 || normalizedToken.length > 80) {
      throw new Error("shared_ride_not_found");
    }

    const rpcClient = supabase as unknown as UntypedRpcClient;
    const { data, error } = await rpcClient.rpc("get_shared_passenger_ride", {
      _token: normalizedToken,
    });

    if (error) {
      console.error("[SharedRideService] Public ride lookup failed", {
        code: error.code,
        message: error.message,
      });
      throw new Error("shared_ride_unavailable");
    }

    if (!isRecord(data) || data["ok"] !== true || !isRecord(data["ride"])) {
      throw new Error("shared_ride_not_found");
    }

    return normalizeSnapshot(data["ride"]);
  }
}

export const sharedRideService = new SharedRideService();
