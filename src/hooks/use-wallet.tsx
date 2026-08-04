import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { WalletSummary } from "@/types/payments";
import { walletService } from "@/services/wallet/wallet-service";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export type WalletState = "loading" | "available" | "not_found" | "blocked" | "failed";

interface WalletContextType {
  wallet: WalletSummary | null;
  state: WalletState;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [state, setState] = useState<WalletState>("loading");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWallet = useCallback(async () => {
    if (!user) {
      setWallet(null);
      setState("not_found");
      return;
    }

    try {
      setIsLoading(true);
      const data = await walletService.getWallet(user.id);
      
      if (!data) {
        setWallet(null);
        setState("not_found");
      } else {
        const normalizedWallet: WalletSummary = {
          ...data,
          available_balance: data.balance,
          status: data.is_blocked ? "blocked" : "active"
        };
        setWallet(normalizedWallet);
        setState(data.is_blocked ? "blocked" : "available");
      }
      setError(null);
    } catch (err) {
      setError("wallet_load_failed");
      setState("failed");
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
          { event: "*", schema: "public", table: "passenger_wallets", filter: `passenger_id=eq.${user.id}` },
          () => {
            loadWallet();
          }
        )
        .subscribe();

      return () => {
        if (channel) 
        supabase.removeChannel(channel);
      };
    }
  }, [user, loadWallet]);

  return (
    <WalletContext.Provider value={{ wallet, state, isLoading, error, refresh: loadWallet }}>
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used within WalletProvider");
  return context;
};
