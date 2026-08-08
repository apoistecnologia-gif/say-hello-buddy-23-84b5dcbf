import { Capacitor } from "@capacitor/core";
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

export interface SafetyLocation {
  lat: number;
  lng: number;
  accuracy: number | null;
}

export interface SosResult {
  alertId: string;
  status: string;
  createdAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) throw new Error("sos_invalid_response");
  return value;
}

class RideSafetyService {
  async getCurrentLocation(): Promise<SafetyLocation> {
    if (Capacitor.isNativePlatform()) {
      let permission = await Geolocation.checkPermissions();
      if (permission.location !== "granted" && permission.coarseLocation !== "granted") {
        permission = await Geolocation.requestPermissions({ permissions: ["location", "coarseLocation"] });
      }
      if (permission.location !== "granted" && permission.coarseLocation !== "granted") {
        throw new Error("location_permission_denied");
      }
    }

    try {
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 5_000,
      });

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("location_unavailable");

      return {
        lat,
        lng,
        accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
      };
    } catch (error) {
      if (error instanceof Error && error.message === "location_permission_denied") throw error;
      console.error("[RideSafetyService] Could not resolve current location", error);
      throw new Error("location_unavailable");
    }
  }

  async triggerSos(
    rideId: string,
    location: SafetyLocation,
    severity: "low" | "medium" | "high" | "critical" = "critical",
    message?: string,
  ): Promise<SosResult> {
    const normalizedRideId = rideId.trim();
    if (!normalizedRideId) throw new Error("ride_id_required");

    const rpcClient = supabase as unknown as UntypedRpcClient;
    const { data, error } = await rpcClient.rpc("passenger_trigger_sos", {
      _ride_id: normalizedRideId,
      _lat: location.lat,
      _lng: location.lng,
      _severity: severity,
      _message: message?.trim() || null,
    });

    if (error) {
      console.error("[RideSafetyService] SOS backend registration failed", {
        code: error.code,
        message: error.message,
      });
      throw new Error("sos_registration_failed");
    }

    if (!isRecord(data) || data["ok"] !== true) throw new Error("sos_registration_failed");

    return {
      alertId: readString(data, "alert_id"),
      status: readString(data, "status"),
      createdAt: readString(data, "created_at"),
    };
  }

  async triggerSosWithCurrentLocation(rideId: string, message?: string): Promise<SosResult> {
    const location = await this.getCurrentLocation();
    return this.triggerSos(rideId, location, "critical", message);
  }
}

export const rideSafetyService = new RideSafetyService();
