// Payment provider abstraction (Phase 3 — Asaas first).
// This file MUST stay provider-agnostic so MOVVI can migrate to Pagar.me,
// Mercado Pago, Iugu, etc. without rewriting the app.

export type PaymentProviderId = "asaas" | "pagarme" | "mercadopago" | "iugu";

export type SubscriptionUiStatus =
  | "active"
  | "pending_payment"
  | "expired"
  | "blocked"
  | "cancelled";

export type SubscriptionPaymentMethod = "pix" | "credit_card";

export interface SubscriptionChargeResult {
  provider: PaymentProviderId;
  providerReference: string;      // e.g. Asaas payment id
  status: "pending" | "paid" | "failed";
  amount: number;
  currency: string;
  method: SubscriptionPaymentMethod;
  invoiceUrl?: string | null;
  pixQrCode?: string | null;      // base64 image payload
  pixCopyPaste?: string | null;   // "copia e cola" string
  dueDate?: string | null;
}

export interface EnsureCustomerInput {
  driverId: string;
  name: string;
  email: string;
  phone?: string | null;
  cpfCnpj?: string | null;
}

export interface EnsureCustomerResult {
  provider: PaymentProviderId;
  customerId: string;
}

export interface CreateMonthlyChargeInput {
  driverId: string;
  customerId: string;
  amount: number;
  method: SubscriptionPaymentMethod;
  description?: string;
}

// The abstract provider port. Every provider (Asaas today, others tomorrow)
// implements this. Keep it small and free of provider-specific fields.
export interface PaymentProvider {
  id: PaymentProviderId;
  isConfigured(): boolean;
  ensureCustomer(input: EnsureCustomerInput): Promise<EnsureCustomerResult>;
  createMonthlyCharge(input: CreateMonthlyChargeInput): Promise<SubscriptionChargeResult>;
  parseWebhook(payload: unknown): {
    event?: string;
    providerReference: string | null;
    status: "paid" | "pending" | "failed" | "expired" | "refunded" | "unknown";
    paidAt?: string | null;
    subscriptionId?: string | null;
    customerId?: string | null;
    value?: number | null;
    dueDate?: string | null;
    invoiceUrl?: string | null;
    bankSlipUrl?: string | null;
  };
}

export const SUBSCRIPTION_STATUS_UI_LABELS: Record<SubscriptionUiStatus, string> = {
  active: "Ativa",
  pending_payment: "Pagamento pendente",
  expired: "Expirada",
  blocked: "Bloqueada",
  cancelled: "Cancelada",
};

/** Maps DB `driver_subscription_status` enum to the UI-facing status. */
export function toUiStatus(db: string | null | undefined): SubscriptionUiStatus {
  switch (db) {
    case "active":
      return "active";
    case "pending":
    case "overdue":
      return "pending_payment";
    case "expired":
      return "expired";
    case "blocked":
    case "suspended":
      return "blocked";
    case "cancelled":
      return "cancelled";
    default:
      return "pending_payment";
  }
}

export const MOVVI_MONTHLY_FEE_BRL = 49.9;
