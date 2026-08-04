const OFFICIAL_MP_BASE_URL = "https://api.mercadopago.com";
const DEFAULT_MONTHLY_FEE = 49.9;
const DEFAULT_BILLING_DAYS = 30;
const DEFAULT_GRACE_DAYS = 3;

export type BillingPlan = {
  id: string | null;
  amount: number;
  billingDays: number;
  graceDays: number;
};

export type DriverForBilling = {
  id: string;
  user_id: string;
  name: string | null;
  email: string | null;
};

export type CurrentSubscription = {
  id: string;
  status: string;
  period_end: string;
};

type Preference = {
  id: string;
  init_point?: string;
  sandbox_init_point?: string;
};

function positiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function appSettingNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function mercadoPagoBaseUrl(): string {
  const configured = Deno.env
    .get("MERCADOPAGO_BASE_URL")
    ?.trim()
    .replace(/\/+$/, "");
  return configured === OFFICIAL_MP_BASE_URL
    ? configured
    : OFFICIAL_MP_BASE_URL;
}

export function driverReturnUrl(): string {
  const configured = Deno.env
    .get("MOVVI_DRIVER_SUBSCRIPTION_RETURN_URL")
    ?.trim();
  if (configured?.startsWith("https://")) return configured;
  return "https://app.movvidriver.com.br/motorista/assinatura";
}

export async function loadBillingPlan(admin: any): Promise<BillingPlan> {
  const { data: plan, error: planError } = await admin
    .from("subscription_plans")
    .select("id,price,promotional_price,billing_cycle_days,grace_period_days")
    .eq("enabled", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (planError) throw new Error(`PLAN_LOOKUP_FAILED:${planError.message}`);
  if (plan) {
    return {
      id: plan.id,
      amount: positiveNumber(
        plan.promotional_price ?? plan.price,
        DEFAULT_MONTHLY_FEE,
      ),
      billingDays: Math.round(
        positiveNumber(plan.billing_cycle_days, DEFAULT_BILLING_DAYS),
      ),
      graceDays: Math.round(
        positiveNumber(plan.grace_period_days, DEFAULT_GRACE_DAYS),
      ),
    };
  }

  const { data: setting } = await admin
    .from("app_settings")
    .select("value")
    .in("key", ["finance.monthly_fee", "subscription.default_plan_price"])
    .limit(2);
  const configured = (setting ?? [])
    .map((row: { value: unknown }) => appSettingNumber(row.value))
    .find((value: number | null) => value !== null);

  return {
    id: null,
    amount: positiveNumber(configured, DEFAULT_MONTHLY_FEE),
    billingDays: DEFAULT_BILLING_DAYS,
    graceDays: DEFAULT_GRACE_DAYS,
  };
}

export async function findReusablePendingCharge(
  admin: any,
  driverUserId: string,
) {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("subscriptions")
    .select("id,provider_reference,invoice_url,amount,created_at,grace_until")
    .eq("driver_id", driverUserId)
    .eq("status", "pending")
    .not("invoice_url", "is", null)
    .not("provider_reference", "is", null)
    .gt("grace_until", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`PENDING_LOOKUP_FAILED:${error.message}`);
  return data ?? null;
}

export async function findCurrentPaidSubscription(
  admin: any,
  driverUserId: string,
  now = new Date(),
): Promise<CurrentSubscription | null> {
  const { data, error } = await admin
    .from("subscriptions")
    .select("id,status,period_end")
    .eq("driver_id", driverUserId)
    .eq("status", "active")
    .not("paid_at", "is", null)
    .or(`period_start.is.null,period_start.lte.${now.toISOString()}`)
    .gt("period_end", now.toISOString())
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`ACTIVE_LOOKUP_FAILED:${error.message}`);
  return (data as CurrentSubscription | null) ?? null;
}

export async function createMonthlyPreference(args: {
  driver: DriverForBilling;
  plan: BillingPlan;
  source: string;
  supabaseUrl: string;
  chargeId: string;
}): Promise<{ preference: Preference; initPoint: string | null }> {
  const token = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN")?.trim() ?? "";
  if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN_MISSING");

  const returnUrl = driverReturnUrl();
  const idempotencyKey = `movvi-charge-${args.chargeId}`.slice(0, 64);
  const response = await fetch(`${mercadoPagoBaseUrl()}/checkout/preferences`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      items: [
        {
          id: `mensalidade-${args.driver.id}`,
          title: "Mensalidade Motorista MOVVI",
          description: "Mensalidade mensal do motorista MOVVI",
          quantity: 1,
          currency_id: "BRL",
          unit_price: args.plan.amount,
        },
      ],
      external_reference: `subscription:${args.chargeId}`,
      metadata: {
        charge_id: args.chargeId,
        driver_id: args.driver.id,
        user_id: args.driver.user_id,
        plan_id: args.plan.id,
        expected_amount: args.plan.amount,
        kind: "monthly_fee",
        source: args.source,
      },
      back_urls: { success: returnUrl, failure: returnUrl, pending: returnUrl },
      auto_return: "approved",
      notification_url: `${args.supabaseUrl}/functions/v1/mercadopago-webhook`,
    }),
  });
  const text = await response.text();
  if (!response.ok)
    throw new Error(`MP_HTTP_${response.status}:${text.slice(0, 300)}`);
  const preference = JSON.parse(text) as Preference;
  return {
    preference,
    initPoint: preference.init_point ?? preference.sandbox_init_point ?? null,
  };
}

export async function persistPendingCharge(args: {
  admin: any;
  driver: DriverForBilling;
  plan: BillingPlan;
  preference: Preference;
  initPoint: string | null;
  source: string;
  actorId: string;
  chargeId: string;
}) {
  const now = new Date();
  const periodEnd = new Date(
    now.getTime() + args.plan.billingDays * 86_400_000,
  );
  const dueDate = new Date(now.getTime() + args.plan.graceDays * 86_400_000);

  const { error: staleError } = await args.admin
    .from("subscriptions")
    .update({
      status: "cancelled",
      invoice_url: null,
      updated_at: now.toISOString(),
    })
    .eq("driver_id", args.driver.user_id)
    .eq("status", "pending");
  if (staleError)
    throw new Error(`STALE_CHARGE_CLOSE_FAILED:${staleError.message}`);

  const subscriptionPatch = {
    plan_id: args.plan.id,
    status: "pending",
    amount: args.plan.amount,
    period_start: now.toISOString(),
    period_end: periodEnd.toISOString(),
    grace_until: dueDate.toISOString(),
    provider_reference: args.preference.id,
    payment_method: "checkout_pro",
    invoice_url: args.initPoint,
    paid_at: null,
    updated_at: now.toISOString(),
  };
  const subscriptionResult = await args.admin.from("subscriptions").insert({
    id: args.chargeId,
    driver_id: args.driver.user_id,
    ...subscriptionPatch,
  });
  if (subscriptionResult.error) {
    throw new Error(
      `SUBSCRIPTION_WRITE_FAILED:${subscriptionResult.error.message}`,
    );
  }

  const currentPaid = await findCurrentPaidSubscription(
    args.admin,
    args.driver.user_id,
    now,
  );
  const billingStatusPatch = currentPaid
    ? {}
    : {
        subscription_status: "pending",
        financial_status: "pending",
      };
  const driverResult = await args.admin
    .from("drivers")
    .update({
      mercadopago_preapproval_id: args.preference.id,
      mercadopago_init_point: args.initPoint,
      subscription_value: args.plan.amount,
      ...billingStatusPatch,
      next_due_date: currentPaid
        ? currentPaid.period_end.slice(0, 10)
        : dueDate.toISOString().slice(0, 10),
      last_payment_status: "PENDING",
      last_invoice_url: args.initPoint,
    })
    .eq("id", args.driver.id);
  if (driverResult.error)
    throw new Error(`DRIVER_WRITE_FAILED:${driverResult.error.message}`);

  await args.admin.from("driver_payment_events").insert({
    driver_id: args.driver.id,
    provider: "mercadopago",
    event_type: `preference.${args.source}`,
    mp_preapproval_id: args.preference.id,
    status: "pending",
    value: args.plan.amount,
    due_date: dueDate.toISOString().slice(0, 10),
    invoice_url: args.initPoint,
    raw_payload: {
      charge_id: args.chargeId,
      preference_id: args.preference.id,
      source: args.source,
      triggered_by: args.actorId,
    },
  });

  return { dueDate: dueDate.toISOString().slice(0, 10) };
}
