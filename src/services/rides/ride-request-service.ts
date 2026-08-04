import { supabase } from "@/integrations/supabase/client";
import { RideRequestPayload, RideRequestResponse } from "@/types/rides/ride-request";

class RideRequestService {
  async createRide(payload: RideRequestPayload): Promise<RideRequestResponse> {
    try {
      const { data, error } = await supabase.functions.invoke("request-ride", {
        body: payload,
      });

      if (error) {
        console.error("Edge Function error:", error);
        return {
          ok: false,
          error_code: error.message || "internal_error",
          message: "Não foi possível solicitar a corrida agora. Tente novamente.",
        };
      }

      return {
        ok: true,
        ...data,
      };
    } catch (err) {
      console.error("Network error calling request-ride:", err);
      return {
        ok: false,
        error_code: "network_error",
        message: "Falha na conexão. Verifique sua internet.",
      };
    }
  }

  async cancelRide(rideId: string): Promise<{ ok: boolean; message?: string }> {
    try {
      const { data, error } = await supabase.functions.invoke("request-ride", {
        body: {
          action: "cancel",
          ride_id: rideId,
        },
      });

      if (error) throw error;
      return { ok: true, ...data };
    } catch (err) {
      console.error("Error canceling ride:", err);
      return { ok: false, message: "Não foi possível cancelar a corrida." };
    }
  }
}

export const rideRequestService = new RideRequestService();
