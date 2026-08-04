import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { mercadoPagoBaseUrl } from "../_shared/mercadopago.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN")?.trim() ?? "";
const MP_WEBHOOK_SECRET = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET")?.trim() ?? "";
const MAX_SIGNATURE_AGE_SECONDS = 300;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-signature, x-request-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) {
    difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return difference === 0;
}

function signatureTimestamp(signature: string): string {
  const part = signature
    .split(",")
    .map((item) => item.trim())
    .find((item) => item.startsWith("ts="));
  return part?.slice(3) ?? "";
}

async function verifySignature(dataId: string, requestId: string, signature: string) {
  if (!MP_WEBHOOK_SECRET || !signature || !requestId) return false;
  const parts = Object.fromEntries(
    signature.split(",").map((part) => {
      const [key, ...value] = part.trim().split("=");
      return [key, value.join("=")];
    }),
  );
  const ts = parts.ts;
  const receivedHash = parts.v1?.toLowerCase();
  const timestamp = Number(ts);
  if (!ts || !receivedHash || !Number.isFinite(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > MAX_SIGNATURE_AGE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(MP_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const expectedHash = Array.from(new Uint8Array(signed))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return safeEqual(expectedHash, receivedHash);
}

async function mpFetch<T>(path: string): Promise<T> {
  if (!MP_TOKEN) throw new Error("MERCADOPAGO_ACCESS_TOKEN_MISSING");
  const response = await fetch(`${mercadoPagoBaseUrl()}${path}`, {
    headers: { Authorization: `Bearer ${MP_TOKEN}` },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`MP_HTTP_${response.status}:${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

function mappedStatus(status: string): "active" | "pending" | "overdue" | "cancelled" {
  if (status === "approved") return "active";
  if (["pending", "in_process", "authorized"].includes(status)) return "pending";
  if (["cancelled", "refunded", "charged_back"].includes(status)) return "cancelled";
  return "overdue";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!MP_WEBHOOK_SECRET) return json({ error: "webhook_secret_not_configured" }, 503);

  const rawBody = await req.text();
  let payload: {
    type?: string;
    action?: string;
    data?: { id?: string | number };
    id?: string | number;
  };
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const url = new URL(req.url);
  const type = String(
    payload.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "",
  );
  const dataId = String(
    payload.data?.id ??
      payload.id ??
      url.searchParams.get("data.id") ??
      url.searchParams.get("id") ??
      "",
  );
  if (!dataId || !type) return json({ ok: true, ignored: "missing_event_identity" });

  const requestId = req.headers.get("x-request-id") ?? "";
  const signature = req.headers.get("x-signature") ?? "";
  if (!(await verifySignature(dataId, requestId, signature).catch(() => false))) {
    return json({ error: "invalid_signature" }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const eventKey = `${type}:${payload.action ?? ""}:${dataId}:${signatureTimestamp(signature)}`;
  const { data: receipt, error: receiptError } = await admin
    .from("payment_webhook_receipts")
    .insert({
      provider: "mercadopago",
      event_key: eventKey,
      request_id: requestId,
      status: "processing",
    })
    .select("id")
    .single();
  if (receiptError?.code === "23505") return json({ ok: true, duplicate: true });
  if (receiptError || !receipt) return json({ error: "receipt_write_failed" }, 500);

  const finishReceipt = async (status: string, detail?: string) => {
    await admin
      .from("payment_webhook_receipts")
      .update({
        status,
        detail: detail?.slice(0, 500) ?? null,
        processed_at: new Date().toISOString(),
      })
      .eq("id", receipt.id);
  };

  try {
    if (type !== "payment") {
      await finishReceipt("ignored", `unsupported_type:${type}`);
      return json({ ok: true, ignored: type });
    }

    const payment = await mpFetch<{
      id: number;
      status: string;
      status_detail?: string;
      transaction_amount?: number;
      date_approved?: string | null;
      external_reference?: string | null;
      payment_type_id?: string | null;
      payment_method_id?: string | null;
      metadata?: Record<string, unknown>;
    }>(`/v1/payments/${dataId}`);
    const kind = String(payment.metadata?.kind ?? "");
    const externalReference = payment.external_reference ?? "";

    if (kind === "cancellation_fee" || externalReference.startsWith("fee:")) {
      const feeId = String(payment.metadata?.fee_id ?? externalReference.replace(/^fee:/, ""));
      const { data: fee, error: feeError } = await admin
        .from("cancellation_fees")
        .select("id,fee_amount,is_paid")
        .eq("id", feeId)
        .maybeSingle();
      if (feeError || !fee) throw new Error("CANCELLATION_FEE_NOT_FOUND");
      if (Math.abs(Number(payment.transaction_amount ?? 0) - Number(fee.fee_amount)) > 0.01) {
        await finishReceipt("rejected", "cancellation_fee_amount_mismatch");
        return json({ error: "amount_mismatch" }, 422);
      }
      if (payment.status === "approved" && !fee.is_paid) {
        const { error } = await admin.rpc("settle_cancellation_fee", {
          _fee_id: feeId,
        });
        if (error) throw new Error(`FEE_SETTLE_FAILED:${error.message}`);
      } else if (["refunded", "charged_back"].includes(payment.status) && fee.is_paid) {
        const { error } = await admin.rpc("reverse_cancellation_fee_settlement", {
          _fee_id: feeId,
        });
        if (error) throw new Error(`FEE_REVERSE_FAILED:${error.message}`);
      }
      await admin
        .from("cancellation_fees")
        .update({
          mp_payment_id: String(payment.id),
        })
        .eq("id", feeId);
      await admin.from("driver_payment_events").insert({
        provider: "mercadopago",
        event_type: `fee.${payment.status}`,
        mp_payment_id: String(payment.id),
        status: payment.status,
        value: payment.transaction_amount ?? null,
        paid_at: payment.date_approved ?? null,
        raw_payload: {
          fee_id: feeId,
          status_detail: payment.status_detail ?? null,
        },
      });
      await finishReceipt("processed");
      return json({
        ok: true,
        processed: "cancellation_fee",
        status: payment.status,
      });
    }

    if (kind !== "monthly_fee") {
      await finishReceipt("rejected", "unexpected_payment_kind");
      return json({ error: "unexpected_payment_kind" }, 422);
    }
    const metadataDriverId = String(payment.metadata?.driver_id ?? "");
    const metadataChargeId = String(payment.metadata?.charge_id ?? "");
    const externalChargeId = externalReference.startsWith("subscription:")
      ? externalReference.slice("subscription:".length)
      : "";
    const chargeId = metadataChargeId || externalChargeId;
    if (
      !metadataDriverId ||
      (chargeId && metadataChargeId && externalChargeId !== metadataChargeId)
    ) {
      await finishReceipt("rejected", "driver_reference_mismatch");
      return json({ error: "driver_reference_mismatch" }, 422);
    }

    const { data: driver, error: driverError } = await admin
      .from("drivers")
      .select("id,user_id")
      .eq("id", metadataDriverId)
      .maybeSingle();
    if (driverError || !driver) throw new Error("DRIVER_NOT_FOUND");

    let subscriptionQuery = admin
      .from("subscriptions")
      .select(
        "id,amount,period_start,period_end,provider_reference,provider_payment_id,status,plan_id,paid_at",
      )
      .eq("driver_id", driver.user_id);
    if (chargeId) {
      subscriptionQuery = subscriptionQuery.eq("id", chargeId);
    } else if (externalReference === metadataDriverId) {
      // Compatibilidade exclusiva com a única cobrança legada que já podia
      // estar aberta no momento da implantação desta versão.
      subscriptionQuery = subscriptionQuery
        .in("status", ["pending", "overdue"])
        .order("created_at", { ascending: false })
        .limit(1);
    } else {
      await finishReceipt("rejected", "missing_charge_identity");
      return json({ error: "missing_charge_identity" }, 422);
    }
    const { data: subscription, error: subscriptionError } = await subscriptionQuery.maybeSingle();
    if (subscriptionError || !subscription) throw new Error("SUBSCRIPTION_CHARGE_NOT_FOUND");
    if (Math.abs(Number(payment.transaction_amount ?? 0) - Number(subscription.amount)) > 0.01) {
      await finishReceipt("rejected", "subscription_amount_mismatch");
      return json({ error: "amount_mismatch" }, 422);
    }

    const status = mappedStatus(payment.status);
    const now = new Date();
    let billingDays = 30;
    if (subscription.plan_id) {
      const { data: plan } = await admin
        .from("subscription_plans")
        .select("billing_cycle_days")
        .eq("id", subscription.plan_id)
        .maybeSingle();
      billingDays = Math.max(1, Number(plan?.billing_cycle_days ?? 30));
    }
    const sameApprovedPayment =
      payment.status === "approved" &&
      subscription.status === "active" &&
      subscription.paid_at &&
      subscription.provider_payment_id === String(payment.id);
    let periodStart =
      sameApprovedPayment && subscription.period_start ? new Date(subscription.period_start) : now;
    if (payment.status === "approved") {
      if (
        subscription.provider_payment_id &&
        subscription.provider_payment_id !== String(payment.id)
      ) {
        await finishReceipt("rejected", "charge_already_paid_by_other_payment");
        return json({ error: "charge_already_paid" }, 409);
      }
      const { data: currentPaid, error: currentPaidError } = await admin
        .from("subscriptions")
        .select("period_end")
        .eq("driver_id", driver.user_id)
        .eq("status", "active")
        .not("paid_at", "is", null)
        .gt("period_end", now.toISOString())
        .neq("id", subscription.id)
        .order("period_end", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (currentPaidError) {
        throw new Error(`CURRENT_SUBSCRIPTION_LOOKUP_FAILED:${currentPaidError.message}`);
      }
      const currentEnd = currentPaid?.period_end ? new Date(currentPaid.period_end) : null;
      if (
        !sameApprovedPayment &&
        currentEnd &&
        Number.isFinite(currentEnd.getTime()) &&
        currentEnd.getTime() > now.getTime()
      ) {
        periodStart = currentEnd;
      }
    }
    const periodEnd = sameApprovedPayment
      ? subscription.period_end
      : payment.status === "approved"
        ? new Date(periodStart.getTime() + billingDays * 86_400_000).toISOString()
        : subscription.period_end;
    const method = payment.payment_type_id ?? payment.payment_method_id ?? "unknown";
    const approved = payment.status === "approved";
    const reversed = ["refunded", "charged_back"].includes(payment.status);
    const subscriptionPatch: Record<string, unknown> = {
      status,
      period_start: approved ? periodStart.toISOString() : subscription.period_start,
      period_end: approved ? periodEnd : subscription.period_end,
      payment_method: method,
      paid_at: approved
        ? (payment.date_approved ?? subscription.paid_at ?? now.toISOString())
        : reversed
          ? null
          : subscription.paid_at,
      updated_at: now.toISOString(),
    };
    if (approved || reversed) {
      subscriptionPatch.provider_payment_id = String(payment.id);
      subscriptionPatch.invoice_url = null;
    }
    const subResult = await admin
      .from("subscriptions")
      .update(subscriptionPatch)
      .eq("id", subscription.id)
      .or(`provider_payment_id.is.null,provider_payment_id.eq.${String(payment.id)}`)
      .select("id")
      .maybeSingle();
    if (subResult.error || !subResult.data)
      throw new Error(
        `SUBSCRIPTION_UPDATE_FAILED:${subResult.error?.message ?? "payment_identity_conflict"}`,
      );

    // Se um período atual for estornado depois de uma renovação antecipada,
    // antecipa os períodos pagos seguintes para eliminar o intervalo aberto
    // pelo estorno. A duração já comprada de cada período é preservada.
    if (reversed) {
      const { data: remainingPeriods, error: remainingPeriodsError } = await admin
        .from("subscriptions")
        .select("id,period_start,period_end")
        .eq("driver_id", driver.user_id)
        .eq("status", "active")
        .not("paid_at", "is", null)
        .gt("period_end", now.toISOString())
        .neq("id", subscription.id)
        .order("period_start", { ascending: true });
      if (remainingPeriodsError) {
        throw new Error(`REMAINING_PERIODS_LOOKUP_FAILED:${remainingPeriodsError.message}`);
      }

      let coverageCursor = now.getTime();
      for (const period of remainingPeriods ?? []) {
        const originalStart = new Date(period.period_start ?? now).getTime();
        const originalEnd = new Date(period.period_end).getTime();
        if (!Number.isFinite(originalEnd)) {
          throw new Error("INVALID_REMAINING_PERIOD_END");
        }
        const duration = Math.max(
          86_400_000,
          originalEnd - (Number.isFinite(originalStart) ? originalStart : coverageCursor),
        );
        if (Number.isFinite(originalStart) && originalStart <= coverageCursor) {
          coverageCursor = Math.max(coverageCursor, originalEnd);
          continue;
        }
        const shiftedEnd = coverageCursor + duration;
        const { error: shiftError } = await admin
          .from("subscriptions")
          .update({
            period_start: new Date(coverageCursor).toISOString(),
            period_end: new Date(shiftedEnd).toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("id", period.id);
        if (shiftError) {
          throw new Error(`PERIOD_SHIFT_FAILED:${shiftError.message}`);
        }
        coverageCursor = shiftedEnd;
      }
    }

    const driverPatch: Record<string, unknown> = {
      last_payment_id: String(payment.id),
      last_payment_status: payment.status,
    };
    if (approved) {
      driverPatch.financial_status = "active";
      driverPatch.subscription_status = "active";
      driverPatch.next_due_date = periodEnd?.slice(0, 10);
      driverPatch.subscription_expires_at = periodEnd;
      driverPatch.mercadopago_init_point = null;
    } else {
      const { data: stillPaid } = await admin
        .from("subscriptions")
        .select("id,period_end")
        .eq("driver_id", driver.user_id)
        .eq("status", "active")
        .not("paid_at", "is", null)
        .or(`period_start.is.null,period_start.lte.${now.toISOString()}`)
        .gt("period_end", now.toISOString())
        .neq("id", subscription.id)
        .limit(1)
        .maybeSingle();
      if (stillPaid?.period_end) {
        driverPatch.financial_status = "active";
        driverPatch.subscription_status = "active";
        driverPatch.next_due_date = stillPaid.period_end.slice(0, 10);
        driverPatch.subscription_expires_at = stillPaid.period_end;
      } else {
        driverPatch.financial_status = status;
        driverPatch.subscription_status = status;
        driverPatch.next_due_date = null;
        driverPatch.subscription_expires_at = null;
      }
    }
    const driverResult = await admin.from("drivers").update(driverPatch).eq("id", driver.id);
    if (driverResult.error) throw new Error(`DRIVER_UPDATE_FAILED:${driverResult.error.message}`);

    await admin.from("driver_payment_events").insert({
      driver_id: driver.id,
      provider: "mercadopago",
      event_type: `payment.${payment.status}`,
      mp_payment_id: String(payment.id),
      mp_preapproval_id: subscription.provider_reference,
      status: payment.status,
      value: payment.transaction_amount ?? null,
      paid_at: payment.date_approved ?? null,
      raw_payload: {
        payment_id: String(payment.id),
        status_detail: payment.status_detail ?? null,
        payment_method: method,
      },
    });

    if (approved) {
      await admin.from("notification_inbox").insert({
        user_id: driver.user_id,
        title: "Mensalidade paga com sucesso",
        body: "Sua mensalidade MOVVI foi confirmada. Bons rolês!",
        category: "billing",
        data: {
          payment_id: String(payment.id),
          amount: payment.transaction_amount ?? null,
        },
      });
    }

    await finishReceipt("processed");
    return json({ ok: true, processed: "payment", status: payment.status });
  } catch (error) {
    const detail = String(error).slice(0, 500);
    console.error("[mercadopago-webhook]", detail);
    await finishReceipt("failed", detail);
    return json({ error: "processing_failed" }, 500);
  }
});
