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

export interface PassengerShareSession {
  rideId: string;
  token: string;
  expiresAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class PassengerShareService {
  async create(rideId: string): Promise<PassengerShareSession> {
    const normalizedRideId = rideId.trim();
    if (!normalizedRideId) throw new Error("Corrida inválida para compartilhamento.");

    const rpc = supabase as unknown as UntypedRpcClient;
    const { data, error } = await rpc.rpc("create_passenger_share_token", {
      _ride_id: normalizedRideId,
    });

    if (error) {
      console.error("[PassengerShareService] Failed to create share token", {
        code: error.code,
        message: error.message,
        rideId: normalizedRideId,
      });
      throw new Error(
        error.message.toLowerCase().includes("ride_not_shareable")
          ? "Esta corrida ainda não pode ser compartilhada."
          : "Não foi possível criar o link protegido desta corrida.",
      );
    }

    if (
      !isRecord(data) ||
      data["ok"] !== true ||
      typeof data["share_token"] !== "string" ||
      typeof data["expires_at"] !== "string"
    ) {
      throw new Error("O servidor não confirmou o link protegido desta corrida.");
    }

    return {
      rideId:
        typeof data["ride_id"] === "string" ? data["ride_id"] : normalizedRideId,
      token: data["share_token"],
      expiresAt: data["expires_at"],
    };
  }

  async revoke(rideId: string): Promise<void> {
    const normalizedRideId = rideId.trim();
    if (!normalizedRideId) throw new Error("Corrida inválida para encerrar o compartilhamento.");

    const rpc = supabase as unknown as UntypedRpcClient;
    const { data, error } = await rpc.rpc("revoke_passenger_share_token", {
      _ride_id: normalizedRideId,
    });

    if (error) {
      console.error("[PassengerShareService] Failed to revoke share token", {
        code: error.code,
        message: error.message,
        rideId: normalizedRideId,
      });
      throw new Error("Não foi possível encerrar o compartilhamento desta corrida.");
    }

    if (!isRecord(data) || data["ok"] !== true || data["revoked"] !== true) {
      throw new Error("O servidor não confirmou o encerramento do compartilhamento.");
    }
  }
}

export const passengerShareService = new PassengerShareService();
