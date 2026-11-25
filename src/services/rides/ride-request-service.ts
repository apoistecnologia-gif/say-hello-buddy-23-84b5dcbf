import { supabase } from "@/integrations/supabase/client";
import { withPilotCreation } from "@/components/navigation/pilot-runtime";
import { RideRequestPayload, RideRequestResponse } from "@/types/rides/ride-request";

export interface RideCancellationResponse {
  ok: boolean;
  message?: string;
  error_code?: string;
  cancellation_fee?: number;
  status?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readOptionalNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeCreateResponse(data: unknown): RideRequestResponse {
  if (!isRecord(data)) {
    return {
      ok: false,
      error_code: "invalid_response",
      message: "O servidor retornou uma resposta inválida.",
    };
  }

  const response: RideRequestResponse = {
    ok: data["ok"] === true,
  };

  const rideId = readOptionalString(data, "rideId") ?? readOptionalString(data, "ride_id");
  const status = readOptionalString(data, "status");
  const message = readOptionalString(data, "message");
  const errorCode = readOptionalString(data, "error_code");
  const candidates = readOptionalNumber(data, "candidates");
  const estimatedPrice = readOptionalNumber(data, "estimated_price");

  if (rideId) response.rideId = rideId;
  if (status) response.status = status;
  if (message) response.message = message;
  if (errorCode) response.error_code = errorCode;
  if (candidates !== undefined) response.candidates = candidates;
  if (estimatedPrice !== undefined) response.estimated_price = estimatedPrice;
  if (typeof data["reused"] === "boolean") response.reused = data["reused"];
  if (typeof data["scheduled_for"] === "string" || data["scheduled_for"] === null) {
    response.scheduled_for = data["scheduled_for"];
  }

  if (response.ok && !response.rideId) {
    return {
      ok: false,
      error_code: "invalid_response",
      message: "A corrida não foi confirmada pelo servidor.",
    };
  }

  return response;
}

function normalizeCancellationResponse(data: unknown): RideCancellationResponse {
  if (!isRecord(data)) {
    return {
      ok: false,
      error_code: "invalid_response",
      message: "O servidor retornou uma resposta inválida.",
    };
  }

  const response: RideCancellationResponse = {
    ok: data["ok"] === true,
  };

  const message = readOptionalString(data, "message");
  const errorCode = readOptionalString(data, "error_code");
  const status = readOptionalString(data, "status");
  const cancellationFee = readOptionalNumber(data, "cancellation_fee");

  if (message) response.message = message;
  if (errorCode) response.error_code = errorCode;
  if (status) response.status = status;
  if (cancellationFee !== undefined) response.cancellation_fee = cancellationFee;

  return response;
}

class RideRequestService {
  async createRide(payload: RideRequestPayload): Promise<RideRequestResponse> {
    try {
      const { data, error } = await withPilotCreation((headers) => supabase.functions.invoke("request-ride", {
        body: payload,
        ...(headers ? { headers } : {}),
      }));

      if (error) {
        console.error("[RideRequestService] Edge Function error:", error);
        return {
          ok: false,
          error_code: error.message || "internal_error",
          message: "Não foi possível solicitar a corrida agora. Tente novamente.",
        };
      }

      return normalizeCreateResponse(data);
    } catch (error) {
      console.error("[RideRequestService] Network error:", error);
      return {
        ok: false,
        error_code: "network_error",
        message: "Falha na conexão. Verifique sua internet.",
      };
    }
  }

  async cancelRide(rideId: string, reason?: string): Promise<RideCancellationResponse> {
    if (!rideId.trim()) {
      return {
        ok: false,
        error_code: "invalid_ride_id",
        message: "Corrida inválida.",
      };
    }

    try {
      const { data, error } = await supabase.functions.invoke("cancel-ride", {
        body: {
          ride_id: rideId,
          ...(reason?.trim() ? { reason: reason.trim() } : {}),
        },
      });

      if (error) {
        console.error("[RideRequestService] Cancellation error:", error);
        return {
          ok: false,
          error_code: error.message || "cancel_failed",
          message: "Não foi possível cancelar a corrida.",
        };
      }

      return normalizeCancellationResponse(data);
    } catch (error) {
      console.error("[RideRequestService] Cancellation network error:", error);
      return {
        ok: false,
        error_code: "network_error",
        message: "Falha na conexão ao cancelar a corrida.",
      };
    }
  }
}

export const rideRequestService = new RideRequestService();
