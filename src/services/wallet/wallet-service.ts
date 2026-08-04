import { supabase } from "@/integrations/supabase/client";
import { WalletSummary } from "@/types/payments";

class WalletService {
  async getWallet(userId: string): Promise<WalletSummary | null> {
    // Busca na tabela oficial 'wallets' ou 'passenger_wallets'
    // Tentamos 'wallets' primeiro conforme padrão do ecossistema APOIS
    const { data, error } = await (supabase as any)
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Error loading wallet:", error);
      return null;
    }

    if (!data) return null;

    return {
      id: data.id,
      user_id: data.user_id,
      balance: Number(data.balance || 0),
      available_balance: Number(data.available_balance || 0),
      blocked_balance: Number(data.blocked_balance || 0),
      status: data.status || "active",
    };
  }
}

export const walletService = new WalletService();
