import { supabase } from "@/integrations/supabase/client";
import { WalletSummary } from "@/types/payments";

class WalletService {
  async getWallet(userId: string): Promise<WalletSummary | null> {
    const { data, error } = await (supabase as any)
      .from("passenger_wallets")
      .select("passenger_id, balance, is_blocked, blocked_reason")
      .eq("passenger_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching passenger wallet:", error);
      throw error;
    }

    if (!data) return null;

    return {
      passenger_id: data.passenger_id,
      balance: Number(data.balance || 0),
      is_blocked: !!data.is_blocked,
      blocked_reason: data.blocked_reason || null
    };
  }
}

export const walletService = new WalletService();
