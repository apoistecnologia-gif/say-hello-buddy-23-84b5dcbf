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

const ELECTRONIC_RIDE_GATE_KEY = "finance.ride_electronic_payments_enabled";
const HOMOLOGATED_ELECTRONIC_METHODS = new Set<PaymentMethodCode>(["pix"]);
const NOT_YET_HOMOLOGATED_METHODS = new Set<PaymentMethodCode>(["credit", "debit"]);

export function normalizePaymentMethodCode(code: string): PaymentMethodCode | null {
  const normalized = code === "credit_card" ? "credit" : code === "debit_card" ? "debit" : code;
  return PAYMENT_METHOD_CODES.includes(normalized as PaymentMethodCode)
    ? (normalized as PaymentMethodCode)
    : null;
}

export function settingEnabled(value: unknown): boolean {
  if (value === true || value === "true") return true;
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return record["enabled"] === true;
  }
  return false;
}

class PaymentService {
  private async electronicRidePaymentsEnabled(): Promise<boolean> {
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", ELECTRONIC_RIDE_GATE_KEY)
      .maybeSingle();

    if (error) {
      console.warn("[PaymentService] Electronic ride payment gate unavailable", {
        code: error.code,
        message: error.message,
      });
      return false;
    }

    return settingEnabled(data?.value);
  }

  async getPaymentMethods(): Promise<PaymentMethod[]> {
    const [{ data, error }, electronicEnabled] = await Promise.all([
      supabase
        .from("payment_methods")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      this.electronicRidePaymentsEnabled(),
    ]);

    if (error) {
      console.error("[PaymentService] Failed to fetch payment methods", error);
      throw new Error("payment_methods_unavailable");
    }

    return (data ?? []).flatMap((method) => {
      const code = normalizePaymentMethodCode(method.code);
      if (!code) return [];

      const isActive = method.is_active === true;
      const isElectronicHomologated = HOMOLOGATED_ELECTRONIC_METHODS.has(code);
      const isElectronicPending = NOT_YET_HOMOLOGATED_METHODS.has(code);
      const providerReady = isElectronicPending
        ? false
        : isElectronicHomologated
          ? electronicEnabled
          : true;
      const enabled = isActive && providerReady;

      return [
        {
          id: method.id,
          code,
          name: method.name,
          label: method.name,
          description:
            isElectronicPending
              ? "Indisponível até a homologação da integração de cartão."
              : isElectronicHomologated && !providerReady
                ? "Indisponível até a confirmação do provedor Pix da corrida."
                : method.description,
          icon: method.icon,
          isActive,
          enabled,
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
