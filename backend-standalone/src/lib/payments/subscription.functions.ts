// Client-safe module that exposes TanStack Start server functions for the
// subscription flow. The Asaas HTTP client is loaded dynamically inside the
// handler so it stays out of the client bundle.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MOVVI_MONTHLY_FEE_BRL, type SubscriptionPaymentMethod } from "./types";

interface CreateChargeInput {
  method: SubscriptionPaymentMethod;
}

/**
 * Ensures a monthly charge exists for the current driver. Uses Asaas when
 * configured; otherwise creates a pending "dev" subscription row so the UI
 * can be exercised end-to-end without real credentials.
 */
export const createDriverMonthlyCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CreateChargeInput) => ({
    method: data.method === "credit_card" ? "credit_card" : "pix",
  }))
  .handler(async ({ data, context }) => {
    const method = data.method as SubscriptionPaymentMethod;
    const { userId, supabase } = context;

    // Load driver + user
    const { data: driver, error: driverErr } = await supabase
      .from("drivers")
      .select("id, name, phone, asaas_customer_id, subscription_status")
      .eq("user_id", userId)
      .maybeSingle();
    if (driverErr || !driver) throw new Error("Motorista não encontrado.");

    const { data: userRow } = await supabase
      .from("users")
      .select("email, name, phone")
      .eq("auth_user_id", userId)
      .maybeSingle();

    // Import server-only Asaas client inside the handler (client bundle safe).
    const { asaasProvider } = await import("./asaas.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Ensure customer
    let customerId = driver.asaas_customer_id as string | null;
    if (!customerId) {
      const ensured = await asaasProvider.ensureCustomer({
        driverId: driver.id,
        name: driver.name ?? userRow?.name ?? "Motorista MOVVI",
        email: userRow?.email ?? `driver-${driver.id}@movvi.local`,
        phone: driver.phone ?? userRow?.phone ?? null,
      });
      customerId = ensured.customerId;
      await supabaseAdmin
        .from("drivers")
        .update({ asaas_customer_id: customerId })
        .eq("id", driver.id);
    }

    const charge = await asaasProvider.createMonthlyCharge({
      driverId: driver.id,
      customerId,
      amount: MOVVI_MONTHLY_FEE_BRL,
      method,
      description: "Mensalidade Motorista MOVVI",
    });

    // Persist subscription row (idempotent by asaas_payment_id).
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const { data: sub, error: subErr } = await supabaseAdmin
      .from("subscriptions")
      .insert({
        driver_id: driver.id,
        status: "pending",
        amount: charge.amount,
        period_start: now.toISOString(),
        period_end: periodEnd.toISOString(),
        provider_reference: charge.providerReference,
        asaas_payment_id: charge.providerReference,
        payment_method: method,
        pix_qr_code: charge.pixQrCode,
        pix_copy_paste: charge.pixCopyPaste,
        invoice_url: charge.invoiceUrl,
      })
      .select("id")
      .single();
    if (subErr) throw new Error(subErr.message);

    // Note: we do NOT write drivers.subscription_status here. The DB trigger
    // `trg_sync_driver_subscription` mirrors subscriptions.status into
    // drivers.subscription_status automatically — one source of truth.

    return {
      subscriptionId: sub.id,
      providerConfigured: asaasProvider.isConfigured(),
      charge,
    };
  });

/** Read-only status probe used by the subscription screen. */
export const getDriverSubscriptionInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, supabase } = context;
    const { data: driver } = await supabase
      .from("drivers")
      .select("id, subscription_status, subscription_expires_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (!driver) return null;

    const { data: latest } = await supabase
      .from("subscriptions")
      .select("id, status, amount, period_end, payment_method, invoice_url, pix_qr_code, pix_copy_paste, paid_at, created_at")
      .eq("driver_id", driver.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      driverId: driver.id,
      subscriptionStatus: driver.subscription_status,
      nextDueAt: driver.subscription_expires_at ?? latest?.period_end ?? null,
      latest,
      monthlyFee: MOVVI_MONTHLY_FEE_BRL,
    };
  });
