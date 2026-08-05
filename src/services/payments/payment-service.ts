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

function normalizePaymentMethodCode(code: string): PaymentMethodCode | null {
  const normalized = code === "credit_card" ? "credit" : code === "debit_card" ? "debit" : code;
  return PAYMENT_METHOD_CODES.includes(normalized as PaymentMethodCode)
    ? (normalized as PaymentMethodCode)
    : null;
}

class PaymentService {
  async getPaymentMethods(): Promise<PaymentMethod[]> {
    const { data, error } = await supabase
      .from("payment_methods")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("[PaymentService] Failed to fetch payment methods", error);
      throw new Error("payment_methods_unavailable");
    }

    return (data ?? []).flatMap((method) => {
      const code = normalizePaymentMethodCode(method.code);
      if (!code) return [];

      const isActive = method.is_active === true;
      return [
        {
          id: method.id,
          code,
          name: method.name,
          label: method.name,
          description: method.description,
          icon: method.icon,
          isActive,
          enabled: isActive,
          sortOrder: method.sort_order ?? 0,
          requiresBalance: method.requires_balance === true,
        } satisfies PaymentMethod,
      ];
    });
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
