import { supabase } from "@/integrations/supabase/client";
import type { WalletSummary } from "@/types/payments";

const normalizeBalance = (value: number | null): number => {
  const balance = Number(value ?? 0);
  return Number.isFinite(balance) && balance >= 0 ? balance : 0;
};

class WalletService {
  async getWallet(userId: string): Promise<WalletSummary | null> {
    const { data, error } = await supabase
      .from("passenger_wallets")
      .select(
        "id, passenger_id, balance, currency, is_blocked, blocked_reason, updated_at",
      )
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
      currency: data.currency === "BRL" ? "BRL" : "BRL",
      status: isBlocked ? "blocked" : "active",
    };
  }
}

export const walletService = new WalletService();
