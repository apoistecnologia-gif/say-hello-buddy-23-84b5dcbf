import { supabase } from "@/integrations/supabase/client";
import { WalletSummary } from "@/types/payments";

class WalletService {
  async getWallet(userId: string): Promise<WalletSummary | null> {
    const { data, error } = await (supabase as any)
      .from("passenger_wallets")
      .select("id, passenger_id, balance, is_blocked, blocked_reason")
      .eq("passenger_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching passenger wallet:", error);
      throw error;
    }

    if (!data) return null;

    return {
      id: data.id || "",
      passengerId: data.passenger_id,
      balance: Number(data.balance || 0),
      available_balance: Number(data.balance || 0),
      isBlocked: !!data.is_blocked,
      blockedReason: data.blocked_reason || null,
      updatedAt: new Date().toISOString(),
      currency: "BRL",
      status: data.is_blocked ? "blocked" : "active",
    };
  }
}

export const walletService = new WalletService();
