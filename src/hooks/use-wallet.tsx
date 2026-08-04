import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { WalletSummary } from "@/types/payments";
import { walletService } from "@/services/wallet/wallet-service";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

interface WalletContextType {
  wallet: WalletSummary | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWallet = useCallback(async () => {
    if (!user) {
      setWallet(null);
      return;
    }

    try {
      setIsLoading(true);
      const data = await walletService.getWallet(user.id);
      setWallet(data);
    } catch (err) {
      setError("wallet_load_failed");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadWallet();

    if (user) {
      const channel = (supabase as any)
        .channel("wallet_changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "wallets", filter: `user_id=eq.${user.id}` },
          () => loadWallet()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user, loadWallet]);

  return (
    <WalletContext.Provider value={{ wallet, isLoading, error, refresh: loadWallet }}>
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used within WalletProvider");
  return context;
};
