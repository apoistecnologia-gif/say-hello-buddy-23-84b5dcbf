import { supabase } from "@/integrations/supabase/client";
import { WalletSummary } from "@/types/payments";

class WalletService {
  async getWallet(userId: string): Promise<WalletSummary | null> {
    const { data, error } = await supabase
      .from("passenger_wallets")
      .select("passenger_id, balance, is_blocked, blocked_reason, created_at, updated_at")
      .eq("passenger_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching passenger wallet:", error);
      throw error;
    }

    if (!data) return null;

    // Map to our internal summary type, strictly adhering to the database fields
    return {
      id: data.passenger_id,
      user_id: data.passenger_id,
      balance: Number(data.balance || 0),
      status: data.is_blocked ? "blocked" : "active",
      is_blocked: !!data.is_blocked,
      blocked_reason: data.blocked_reason || null
    } as any;
  }
}

export const walletService = new WalletService();
