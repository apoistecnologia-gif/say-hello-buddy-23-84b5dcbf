import { supabase } from "@/integrations/supabase/client";
import type {
  CancellationFee,
  CancellationFeePixCharge,
  WalletSummary,
} from "@/types/payments";

const normalizeBalance = (value: number | null): number => {
  const balance = Number(value ?? 0);
  return Number.isFinite(balance) && balance >= 0 ? balance : 0;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parsePixCharge(value: unknown): CancellationFeePixCharge {
  if (!isRecord(value) || value["ok"] !== true) {
    const message =
      isRecord(value) && typeof value["message"] === "string"
        ? value["message"]
        : "Não foi possível gerar o Pix desta multa.";
    throw new Error(message);
  }

  const feeId = typeof value["feeId"] === "string" ? value["feeId"] : "";
  const amount = Number(value["amount"]);
  const qrCode = typeof value["qrCode"] === "string" ? value["qrCode"] : "";
  if (!feeId || !Number.isFinite(amount) || amount <= 0 || !qrCode) {
    throw new Error("A cobrança Pix retornou dados incompletos.");
  }

  return {
    ok: true,
    reused: value["reused"] === true,
    feeId,
    amount,
    qrCode,
    qrCodeBase64:
      typeof value["qrCodeBase64"] === "string" && value["qrCodeBase64"].trim()
        ? value["qrCodeBase64"]
        : null,
    ticketUrl:
      typeof value["ticketUrl"] === "string" && value["ticketUrl"].trim()
        ? value["ticketUrl"]
        : null,
    expiresAt:
      typeof value["expiresAt"] === "string" && value["expiresAt"].trim()
        ? value["expiresAt"]
        : null,
  };
}

class WalletService {
  async getWallet(userId: string): Promise<WalletSummary | null> {
    const { data, error } = await supabase
      .from("passenger_wallets")
      .select("id, passenger_id, balance, currency, is_blocked, blocked_reason, updated_at")
      .eq("passenger_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[WalletService] Failed to fetch passenger wallet", {
        code: error.code,
        message: error.message,
      });
      throw error;
    }

    if (!data) return null;

    const balance = normalizeBalance(data.balance);
    const isBlocked = data.is_blocked === true;

    return {
      id: data.id,
      passengerId: data.passenger_id,
      balance,
      available_balance: isBlocked ? 0 : balance,
      isBlocked,
      blockedReason: data.blocked_reason ?? null,
      updatedAt: data.updated_at ?? new Date(0).toISOString(),
      currency: "BRL",
      status: isBlocked ? "blocked" : "active",
    };
  }

  async getPendingFees(userId: string): Promise<CancellationFee[]> {
    const { data, error } = await supabase
      .from("cancellation_fees")
      .select("id, ride_id, amount, reason, status, created_at, updated_at")
      .eq("passenger_id", userId)
      .in("status", ["pending", "open", "unpaid"])
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[WalletService] Failed to fetch cancellation fees", {
        code: error.code,
        message: error.message,
      });
      throw error;
    }

    return (data ?? []).map((fee) => ({
      id: fee.id,
      rideId: fee.ride_id ?? null,
      amount: normalizeBalance(fee.amount),
      reason: fee.reason?.trim() || "Multa de cancelamento",
      status: fee.status ?? "pending",
      createdAt: fee.created_at ?? new Date(0).toISOString(),
      updatedAt: fee.updated_at ?? null,
    }));
  }

  async createCancellationFeePix(feeId: string): Promise<CancellationFeePixCharge> {
    const { data, error } = await supabase.functions.invoke("create-cancellation-fee-charge", {
      body: { feeId },
    });

    if (error) {
      console.error("[WalletService] Pix charge failed", {
        message: error.message,
        feeId,
      });
      throw new Error(error.message || "Não foi possível gerar o Pix desta multa.");
    }

    return parsePixCharge(data);
  }
}

export const walletService = new WalletService();
