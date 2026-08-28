import { supabase } from "@/integrations/supabase/client";

export type PassengerSupportCategory = "ride" | "payment" | "account" | "safety" | "other";

export interface PassengerSupportInput {
  category: PassengerSupportCategory;
  subject: string;
  message: string;
  rideId?: string;
}

export interface PassengerSupportTicket {
  id: string;
  protocol: string;
  status: string;
  createdAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class PassengerSupportService {
  async createTicket(input: PassengerSupportInput): Promise<PassengerSupportTicket> {
    const { data, error } = await supabase.functions.invoke("passenger-support", {
      method: "POST",
      body: input,
    });

    if (error || !isRecord(data) || data["ok"] !== true || !isRecord(data["ticket"])) {
      const message =
        isRecord(data) && typeof data["message"] === "string"
          ? data["message"]
          : error?.message || "Não foi possível registrar seu atendimento agora.";
      throw new Error(message);
    }

    const ticket = data["ticket"];
    const id = typeof ticket["id"] === "string" ? ticket["id"] : "";
    const protocol = typeof ticket["protocol"] === "string" ? ticket["protocol"] : "";
    if (!id || !protocol) throw new Error("O atendimento retornou dados incompletos.");

    return {
      id,
      protocol,
      status: typeof ticket["status"] === "string" ? ticket["status"] : "open",
      createdAt:
        typeof ticket["createdAt"] === "string"
          ? ticket["createdAt"]
          : new Date().toISOString(),
    };
  }
}

export const passengerSupportService = new PassengerSupportService();
