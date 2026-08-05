import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
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
  const userId = user?.id ?? null;
  const activeRequest = useRef(0);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [state, setState] = useState<WalletState>("loading");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWallet = useCallback(async () => {
    const requestId = ++activeRequest.current;

    if (!userId) {
      setWallet(null);
      setState("not_found");
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setState((currentState) =>
      currentState === "available" || currentState === "blocked" ? currentState : "loading",
    );

    try {
      const data = await walletService.getWallet(userId);
      if (requestId !== activeRequest.current) return;

      if (!data) {
        setWallet(null);
        setState("not_found");
      } else {
        setWallet(data);
        setState(data.isBlocked ? "blocked" : "available");
      }

      setError(null);
    } catch (err) {
      if (requestId !== activeRequest.current) return;

      console.error("[WalletProvider] Wallet load failed", err);
      setWallet(null);
      setError("wallet_load_failed");
      setState("failed");
    } finally {
      if (requestId === activeRequest.current) setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadWallet();

    if (!userId) return;

    const handleFinancialChange = () => {
      void loadWallet();
    };

    const channel = supabase
      .channel(`passenger_financial:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "passenger_wallets",
          filter: `passenger_id=eq.${userId}`,
        },
        handleFinancialChange,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cancellation_fees",
          filter: `passenger_id=eq.${userId}`,
        },
        handleFinancialChange,
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[WalletProvider] Financial realtime unavailable", { status, userId });
        }
      });

    return () => {
      activeRequest.current += 1;
      void supabase.removeChannel(channel);
    };
  }, [userId, loadWallet]);

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
