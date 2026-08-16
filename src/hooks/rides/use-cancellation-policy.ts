import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RideCancellationPolicy {
  enabled: boolean;
  freeSeconds: number;
  amount: number;
  blockAfterDriverArrival: boolean;
}

type RpcError = { message?: string };
type RpcClient = {
  rpc: (
    functionName: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcError | null }>;
};

const DEFAULT_POLICY: RideCancellationPolicy = {
  enabled: false,
  freeSeconds: 120,
  amount: 0,
  blockAfterDriverArrival: true,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "sim"].includes(normalized)) return true;
    if (["false", "0", "no", "nao", "não"].includes(normalized)) return false;
  }
  return fallback;
};

const toNonNegativeNumber = (value: unknown, fallback: number) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

export function useCancellationPolicy() {
  const [policy, setPolicy] = useState<RideCancellationPolicy>(DEFAULT_POLICY);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const rpcClient = supabase as unknown as RpcClient;
      const { data, error: rpcError } = await rpcClient.rpc("get_ride_cancellation_policy");
      if (rpcError) throw new Error(rpcError.message || "policy_lookup_failed");
      if (!isRecord(data)) throw new Error("invalid_policy_response");

      setPolicy({
        enabled: toBoolean(data["enabled"], false),
        freeSeconds: Math.min(
          3600,
          Math.floor(toNonNegativeNumber(data["free_seconds"], 120)),
        ),
        amount: Math.round(toNonNegativeNumber(data["amount"], 0) * 100) / 100,
        blockAfterDriverArrival: toBoolean(data["block_after_driver_arrival"], true),
      });
    } catch (caughtError: unknown) {
      console.warn("[CancellationPolicy] policy unavailable", caughtError);
      setPolicy(DEFAULT_POLICY);
      setError("Não foi possível carregar a política atual de cancelamento.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { policy, isLoading, error, refresh: load };
}
