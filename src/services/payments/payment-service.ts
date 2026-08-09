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

const ELECTRONIC_RIDE_METHODS = new Set<PaymentMethodCode>(["pix", "credit", "debit"]);
const ELECTRONIC_RIDE_GATE_KEY = "finance.ride_electronic_payments_enabled";

function normalizePaymentMethodCode(code: string): PaymentMethodCode | null {
  const normalized = code === "credit_card" ? "credit" : code === "debit_card" ? "debit" : code;
  return PAYMENT_METHOD_CODES.includes(normalized as PaymentMethodCode)
    ? (normalized as PaymentMethodCode)
    : null;
}

function settingEnabled(value: unknown): boolean {
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
      // Fail-closed: sem confirmação explícita do backend, o Passageiro não
      // recebe uma forma eletrônica que ainda não possui checkout/webhook de
      // corrida homologado.
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
      const providerReady = !ELECTRONIC_RIDE_METHODS.has(code) || electronicEnabled;
      const enabled = isActive && providerReady;

      return [
        {
          id: method.id,
          code,
          name: method.name,
          label: method.name,
          description:
            !providerReady && ELECTRONIC_RIDE_METHODS.has(code)
              ? "Indisponível até a confirmação do provedor de pagamento da corrida."
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
