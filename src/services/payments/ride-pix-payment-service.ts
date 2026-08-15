import { supabase } from "@/integrations/supabase/client";

export type RidePixCharge = {
  provider: string;
  paymentId: string | null;
  amountCents: number;
  status: string;
  rideStatus: string;
  paymentStatus: string | null;
  paid: boolean;
  pixPayload: string | null;
  pixQrCodeBase64: string | null;
  pixExpirationAt: string | null;
  attemptNumber: number | null;
  reused: boolean;
};

type ChargeAction = "recover" | "retry";

type EdgeError = {
  message?: string;
  context?: { body?: unknown };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function optionalNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseCharge(value: unknown): RidePixCharge {
  if (!isRecord(value) || value["ok"] !== true) {
    const detail = isRecord(value)
      ? optionalString(value, "error") ?? optionalString(value, "detail")
      : null;
    throw new Error(detail ?? "ride_pix_charge_invalid_response");
  }

  const amountCents = optionalNumber(value, "amountCents");
  const provider = optionalString(value, "provider") ?? "asaas";
  const status = optionalString(value, "status") ?? "pending";
  const rideStatus = optionalString(value, "rideStatus") ?? "aguardando_pagamento";

  if (amountCents === null || amountCents <= 0) {
    throw new Error("ride_pix_charge_invalid_amount");
  }

  return {
    provider,
    paymentId: optionalString(value, "paymentId"),
    amountCents,
    status,
    rideStatus,
    paymentStatus: optionalString(value, "paymentStatus"),
    paid: value["paid"] === true || optionalString(value, "paymentStatus") === "paid",
    pixPayload: optionalString(value, "pixPayload"),
    pixQrCodeBase64: optionalString(value, "pixQrCodeBase64"),
    pixExpirationAt: optionalString(value, "pixExpirationAt"),
    attemptNumber: optionalNumber(value, "attemptNumber"),
    reused: value["reused"] === true,
  };
}

async function invokeAsaas(rideId: string, action: ChargeAction): Promise<RidePixCharge> {
  const { data, error } = await supabase.functions.invoke("asaas-create-ride-pix", {
    body: { rideId, action },
  });

  if (error) {
    const edgeError = error as EdgeError;
    const detail = isRecord(edgeError.context?.body)
      ? optionalString(edgeError.context!.body as Record<string, unknown>, "error") ??
        optionalString(edgeError.context!.body as Record<string, unknown>, "detail")
      : null;
    throw new Error(detail ?? edgeError.message ?? "asaas_ride_pix_failed");
  }

  return parseCharge(data);
}

class RidePixPaymentService {
  async recoverOrCreate(rideId: string, provider: string | null): Promise<RidePixCharge> {
    if (!rideId.trim()) throw new Error("ride_id_required");
    const normalizedProvider = provider?.trim().toLowerCase() || "asaas";

    if (normalizedProvider !== "asaas") {
      throw new Error(`ride_pix_provider_unavailable:${normalizedProvider}`);
    }

    return invokeAsaas(rideId, "recover");
  }

  async retry(rideId: string, provider: string | null): Promise<RidePixCharge> {
    if (!rideId.trim()) throw new Error("ride_id_required");
    const normalizedProvider = provider?.trim().toLowerCase() || "asaas";

    if (normalizedProvider !== "asaas") {
      throw new Error(`ride_pix_provider_unavailable:${normalizedProvider}`);
    }

    return invokeAsaas(rideId, "retry");
  }
}

export const ridePixPaymentService = new RidePixPaymentService();
