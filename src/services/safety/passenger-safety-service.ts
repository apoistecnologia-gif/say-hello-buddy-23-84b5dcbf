import { Geolocation } from "@capacitor/geolocation";
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

export interface PassengerSosResult {
  alertId: string;
  rideId: string;
  severity: string;
  status: string;
  createdAt: string | null;
}

type Coordinates = { lat: number | null; lng: number | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function getBestEffortCoordinates(): Promise<Coordinates> {
  try {
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 8_000,
      maximumAge: 5_000,
    });
    const lat = Number(position.coords.latitude);
    const lng = Number(position.coords.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  } catch (error) {
    console.warn("[PassengerSafetyService] Native location unavailable for SOS", {
      message: error instanceof Error ? error.message : "unknown_error",
    });
  }

  if (typeof navigator !== "undefined" && navigator.geolocation) {
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8_000,
          maximumAge: 5_000,
        });
      });
      const lat = Number(position.coords.latitude);
      const lng = Number(position.coords.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    } catch (error) {
      console.warn("[PassengerSafetyService] Browser location unavailable for SOS", {
        message: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }

  return { lat: null, lng: null };
}

class PassengerSafetyService {
  async triggerSos(
    rideId: string,
    severity: "critical" | "high" | "medical" | "security" = "critical",
  ): Promise<PassengerSosResult> {
    const normalizedRideId = rideId.trim();
    if (!normalizedRideId) throw new Error("Corrida inválida para acionar o SOS.");

    const coordinates = await getBestEffortCoordinates();
    const rpcClient = supabase as unknown as UntypedRpcClient;
    const { data, error } = await rpcClient.rpc("create_passenger_sos", {
      _ride_id: normalizedRideId,
      _lat: coordinates.lat,
      _lng: coordinates.lng,
      _severity: severity,
      _message: "SOS acionado pelo passageiro durante corrida ativa.",
    });

    if (error) {
      console.error("[PassengerSafetyService] SOS failed", {
        code: error.code,
        message: error.message,
        rideId: normalizedRideId,
      });
      throw new Error("Não foi possível registrar o SOS na central APOIS.");
    }

    if (!isRecord(data) || data["ok"] !== true || typeof data["alert_id"] !== "string") {
      throw new Error("A central APOIS não confirmou o registro do SOS.");
    }

    return {
      alertId: data["alert_id"],
      rideId: typeof data["ride_id"] === "string" ? data["ride_id"] : normalizedRideId,
      severity: typeof data["severity"] === "string" ? data["severity"] : severity,
      status: typeof data["status"] === "string" ? data["status"] : "open",
      createdAt: typeof data["created_at"] === "string" ? data["created_at"] : null,
    };
  }
}

export const passengerSafetyService = new PassengerSafetyService();