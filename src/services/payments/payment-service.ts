import { supabase } from "@/integrations/supabase/client";
import type {
  CancellationFee,
  PaymentMethod,
  PaymentMethodCode,
} from "@/types/payments";

const PAYMENT_METHOD_CODES: PaymentMethodCode[] = [
  "pix",
  "credit",
  "debit",
  "cash",
  "wallet",
];

interface RpcErrorLike {
  code?: string;
  message: string;
}

interface UntypedRpcClient {
  rpc: (
    functionName: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcErrorLike | null }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePaymentMethodCode(code: string): PaymentMethodCode | null {
  const normalized = code === "credit_card" ? "credit" : code === "debit_card" ? "debit" : code;
  return PAYMENT_METHOD_CODES.includes(normalized as PaymentMethodCode)
    ? (normalized as PaymentMethodCode)
    : null;
}

function readOptionalString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizePaymentMethod(value: unknown): PaymentMethod | null {
  if (!isRecord(value)) return null;

  const rawCode = typeof value["code"] === "string" ? value["code"] : "";
  const code = normalizePaymentMethodCode(rawCode);
  const id = typeof value["id"] === "string" ? value["id"] : "";
  const name = typeof value["name"] === "string" ? value["name"] : "";
  if (!code || !id || !name.trim()) return null;

  const sortOrder = Number(value["sort_order"]);
  return {
    id,
    code,
    name,
    label: name,
    description: readOptionalString(value, "description"),
    icon: readOptionalString(value, "icon"),
    isActive: true,
    enabled: value["enabled"] === true,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    requiresBalance: value["requires_balance"] === true,
  };
}

class PaymentService {
  async getPaymentMethods(): Promise<PaymentMethod[]> {
    const rpcClient = supabase as unknown as UntypedRpcClient;
    const { data, error } = await rpcClient.rpc("get_passenger_payment_methods");

    if (error) {
      console.error("[PaymentService] Failed to fetch canonical payment methods", {
        code: error.code,
        message: error.message,
      });
      throw new Error("payment_methods_unavailable");
    }

    if (!isRecord(data) || data["ok"] !== true || !Array.isArray(data["methods"])) {
      throw new Error("payment_methods_invalid_response");
    }

    return data["methods"]
      .flatMap((method) => {
        const normalized = normalizePaymentMethod(method);
        return normalized ? [normalized] : [];
      })
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  async getCancellationFees(userId: string): Promise<CancellationFee[]> {
    if (!userId.trim()) throw new Error("invalid_user_id");

    const { data, error } = await supabase
      .from("cancellation_fees")
      .select("id, amount, reason, status, created_at")
      .eq("passenger_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[PaymentService] Failed to fetch cancellation fees", error);
      throw new Error("cancellation_fees_unavailable");
    }

    return (data ?? []).flatMap((fee) => {
      if (fee.status !== "pending") return [];

      return [
        {
          id: fee.id,
          amount: fee.amount,
          reason: fee.reason ?? "Taxa de cancelamento",
          status: "pending",
          createdAt: fee.created_at ?? new Date(0).toISOString(),
        } satisfies CancellationFee,
      ];
    });
  }
}

export const paymentService = new PaymentService();
