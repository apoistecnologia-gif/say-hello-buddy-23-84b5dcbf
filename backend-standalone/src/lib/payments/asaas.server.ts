// Server-only Asaas HTTP client. Never import this from client code.
// Keys are read from process.env at call time (server functions / routes only).

import type {
  CreateMonthlyChargeInput,
  EnsureCustomerInput,
  EnsureCustomerResult,
  PaymentProvider,
  SubscriptionChargeResult,
} from "./types";

const ASAAS_BASE = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  production: "https://api.asaas.com/v3",
};

function envMode(): "sandbox" | "production" {
  const raw = (process.env.ASAAS_ENVIRONMENT ?? "sandbox").toLowerCase();
  return raw === "production" ? "production" : "sandbox";
}

function envKey(): string | null {
  return process.env.ASAAS_API_KEY?.trim() || null;
}

async function asaasFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = envKey();
  if (!key) throw new Error("ASAAS_API_KEY_MISSING");
  const base = ASAAS_BASE[envMode()];
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      access_token: key,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ASAAS_HTTP_${res.status}:${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

// ---------- Subscription types ----------

export interface CreateSubscriptionInput {
  driverId: string;
  customerId: string;
  value: number;
  nextDueDate: string; // YYYY-MM-DD
  description?: string;
  billingType?: "PIX" | "BOLETO" | "CREDIT_CARD" | "UNDEFINED";
}

export interface CreateSubscriptionResult {
  subscriptionId: string;
  firstPaymentId: string | null;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  nextDueDate: string;
  status: string;
}

// ---------- Public provider implementation ----------

export const asaasProvider: PaymentProvider & {
  createSubscription: (input: CreateSubscriptionInput) => Promise<CreateSubscriptionResult>;
  getFirstPaymentForSubscription: (subscriptionId: string) => Promise<{
    id: string;
    status: string;
    invoiceUrl: string | null;
    bankSlipUrl: string | null;
    dueDate: string | null;
    value: number | null;
  } | null>;
} = {
  id: "asaas",

  isConfigured() {
    return Boolean(envKey());
  },

  async ensureCustomer(input: EnsureCustomerInput): Promise<EnsureCustomerResult> {
    if (!this.isConfigured()) {
      return { provider: "asaas", customerId: `dev_${input.driverId}` };
    }
    const body = {
      name: input.name,
      email: input.email,
      mobilePhone: input.phone ?? undefined,
      cpfCnpj: input.cpfCnpj ?? undefined,
      externalReference: input.driverId,
    };
    const data = await asaasFetch<{ id: string }>("/customers", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return { provider: "asaas", customerId: data.id };
  },

  async createMonthlyCharge(input: CreateMonthlyChargeInput): Promise<SubscriptionChargeResult> {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);
    const isoDue = dueDate.toISOString().slice(0, 10);

    if (!this.isConfigured()) {
      return {
        provider: "asaas",
        providerReference: `dev_charge_${Date.now()}`,
        status: "pending",
        amount: input.amount,
        currency: "BRL",
        method: input.method,
        invoiceUrl: null,
        pixQrCode: null,
        pixCopyPaste: null,
        dueDate: isoDue,
      };
    }

    const billingType = input.method === "pix" ? "PIX" : "CREDIT_CARD";
    const payment = await asaasFetch<{
      id: string;
      status: string;
      value: number;
      invoiceUrl?: string;
      dueDate?: string;
    }>("/payments", {
      method: "POST",
      body: JSON.stringify({
        customer: input.customerId,
        billingType,
        value: input.amount,
        dueDate: isoDue,
        description: input.description ?? "Mensalidade Motorista MOVVI",
        externalReference: input.driverId,
      }),
    });

    let pixQrCode: string | null = null;
    let pixCopyPaste: string | null = null;
    if (billingType === "PIX") {
      try {
        const qr = await asaasFetch<{ encodedImage?: string; payload?: string }>(
          `/payments/${payment.id}/pixQrCode`,
        );
        pixQrCode = qr.encodedImage ?? null;
        pixCopyPaste = qr.payload ?? null;
      } catch {
        /* ignore */
      }
    }

    return {
      provider: "asaas",
      providerReference: payment.id,
      status: payment.status?.toUpperCase() === "CONFIRMED" ? "paid" : "pending",
      amount: payment.value ?? input.amount,
      currency: "BRL",
      method: input.method,
      invoiceUrl: payment.invoiceUrl ?? null,
      pixQrCode,
      pixCopyPaste,
      dueDate: payment.dueDate ?? isoDue,
    };
  },

  async createSubscription(input: CreateSubscriptionInput): Promise<CreateSubscriptionResult> {
    if (!this.isConfigured()) {
      return {
        subscriptionId: `dev_sub_${input.driverId}_${Date.now()}`,
        firstPaymentId: `dev_pay_${Date.now()}`,
        invoiceUrl: null,
        bankSlipUrl: null,
        nextDueDate: input.nextDueDate,
        status: "ACTIVE",
      };
    }

    const sub = await asaasFetch<{
      id: string;
      status: string;
      nextDueDate?: string;
    }>("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        customer: input.customerId,
        billingType: input.billingType ?? "UNDEFINED",
        value: input.value,
        nextDueDate: input.nextDueDate,
        cycle: "MONTHLY",
        description: input.description ?? "Mensalidade Motorista MOVVI",
        externalReference: input.driverId,
      }),
    });

    // Buscar primeira cobrança gerada pela assinatura
    const first = await this.getFirstPaymentForSubscription(sub.id);

    return {
      subscriptionId: sub.id,
      firstPaymentId: first?.id ?? null,
      invoiceUrl: first?.invoiceUrl ?? null,
      bankSlipUrl: first?.bankSlipUrl ?? null,
      nextDueDate: sub.nextDueDate ?? input.nextDueDate,
      status: sub.status,
    };
  },

  async getFirstPaymentForSubscription(subscriptionId: string) {
    if (!this.isConfigured()) return null;
    try {
      const list = await asaasFetch<{
        data: Array<{
          id: string;
          status: string;
          invoiceUrl?: string;
          bankSlipUrl?: string;
          dueDate?: string;
          value?: number;
        }>;
      }>(`/subscriptions/${subscriptionId}/payments`);
      const p = list.data?.[0];
      if (!p) return null;
      return {
        id: p.id,
        status: p.status,
        invoiceUrl: p.invoiceUrl ?? null,
        bankSlipUrl: p.bankSlipUrl ?? null,
        dueDate: p.dueDate ?? null,
        value: p.value ?? null,
      };
    } catch {
      return null;
    }
  },

  parseWebhook(payload: unknown) {
    const p = (payload ?? {}) as {
      event?: string;
      payment?: {
        id?: string;
        status?: string;
        value?: number;
        subscription?: string;
        dueDate?: string;
        paymentDate?: string;
        confirmedDate?: string;
        invoiceUrl?: string;
        bankSlipUrl?: string;
        customer?: string;
      };
    };
    const ref = p.payment?.id ?? null;
    const event = (p.event ?? "").toUpperCase();
    const paidAt = p.payment?.paymentDate ?? p.payment?.confirmedDate ?? null;

    let status: "paid" | "pending" | "refunded" | "expired" | "failed" | "unknown" = "unknown";
    if (event.includes("CONFIRMED") || event.includes("RECEIVED")) status = "paid";
    else if (event.includes("REFUNDED")) status = "refunded";
    else if (event.includes("OVERDUE") || event.includes("EXPIRED")) status = "expired";
    else if (event.includes("DELETED") || event.includes("FAILED") || event.includes("CHARGEBACK"))
      status = "failed";
    else if (event.includes("CREATED") || event.includes("UPDATED")) status = "pending";

    return {
      event,
      providerReference: ref,
      status,
      paidAt,
      subscriptionId: p.payment?.subscription ?? null,
      customerId: p.payment?.customer ?? null,
      value: typeof p.payment?.value === "number" ? p.payment!.value : null,
      dueDate: p.payment?.dueDate ?? null,
      invoiceUrl: p.payment?.invoiceUrl ?? null,
      bankSlipUrl: p.payment?.bankSlipUrl ?? null,
    };
  },
};

export function getWebhookSecret(): string | null {
  return (
    process.env.ASAAS_WEBHOOK_TOKEN?.trim() ||
    process.env.ASAAS_WEBHOOK_SECRET?.trim() ||
    null
  );
}
