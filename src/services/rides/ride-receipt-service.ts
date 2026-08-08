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

export interface PassengerRideReceipt {
  rideId: string;
  date: string;
  origin: string;
  destination: string;
  driverName: string | null;
  paymentMethod: string;
  grossAmountCents: number;
  discountAmountCents: number;
  platformFeeCents: number;
  providerFeeCents: number;
  totalAmountCents: number;
  paymentStatus: string;
  settlementStatus: string;
  settledAt: string | null;
}

export type PassengerReceiptResult =
  | { available: true; receipt: PassengerRideReceipt }
  | { available: false; reason: "settlement_not_available" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) throw new Error("receipt_invalid_response");
  return value;
}

function readNullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function readCents(record: Record<string, unknown>, key: string): number {
  const value = Number(record[key]);
  if (!Number.isInteger(value) || value < 0) throw new Error("receipt_invalid_response");
  return value;
}

class RideReceiptService {
  async getPassengerReceipt(rideId: string): Promise<PassengerReceiptResult> {
    const normalizedRideId = rideId.trim();
    if (!normalizedRideId) throw new Error("ride_id_required");

    const rpcClient = supabase as unknown as UntypedRpcClient;
    const { data, error } = await rpcClient.rpc("get_passenger_ride_receipt", {
      _ride_id: normalizedRideId,
    });

    if (error) {
      console.error("[RideReceiptService] Receipt lookup failed", {
        code: error.code,
        message: error.message,
      });
      throw new Error("receipt_unavailable");
    }

    if (!isRecord(data)) throw new Error("receipt_invalid_response");
    if (data["ok"] === false && data["error"] === "settlement_not_available") {
      return { available: false, reason: "settlement_not_available" };
    }
    if (data["ok"] !== true || !isRecord(data["receipt"])) {
      throw new Error("receipt_invalid_response");
    }

    const receipt = data["receipt"];
    return {
      available: true,
      receipt: {
        rideId: readString(receipt, "ride_id"),
        date: readString(receipt, "date"),
        origin: readString(receipt, "origin"),
        destination: readString(receipt, "destination"),
        driverName: readNullableString(receipt, "driver_name"),
        paymentMethod: readString(receipt, "payment_method"),
        grossAmountCents: readCents(receipt, "gross_amount_cents"),
        discountAmountCents: readCents(receipt, "discount_amount_cents"),
        platformFeeCents: readCents(receipt, "platform_fee_cents"),
        providerFeeCents: readCents(receipt, "provider_fee_cents"),
        totalAmountCents: readCents(receipt, "total_amount_cents"),
        paymentStatus: readString(receipt, "payment_status"),
        settlementStatus: readString(receipt, "settlement_status"),
        settledAt: readNullableString(receipt, "settled_at"),
      },
    };
  }
}

export const rideReceiptService = new RideReceiptService();
