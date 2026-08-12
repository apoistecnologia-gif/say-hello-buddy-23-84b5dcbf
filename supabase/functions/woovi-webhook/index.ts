import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = (Deno.env.get("WOOVI_WEBHOOK_AUTHORIZATION") ?? "").trim();

type JsonObject = Record<string, unknown>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

function webhookAuthorization(req: Request): string {
  return (
    req.headers.get("x-apois-webhook-secret") ??
    req.headers.get("x-webhook-secret") ??
    req.headers.get("authorization") ??
    ""
  ).trim();
}

function integer(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

async function invokeDispatch(): Promise<void> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/process-ride-dispatch`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
      "content-type": "application/json",
    },
    body: JSON.stringify({ source: "woovi_webhook" }),
  });
  if (!response.ok) {
    console.error("[woovi-webhook] dispatch invoke failed", response.status, (await response.text()).slice(0, 500));
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!WEBHOOK_SECRET) return json({ error: "webhook_not_configured" }, 503);
  if (!safeEqual(webhookAuthorization(req), WEBHOOK_SECRET)) return json({ error: "unauthorized" }, 401);

  let payload: JsonObject;
  try {
    const parsed = await req.json();
    if (!isObject(parsed)) return json({ error: "invalid_payload" }, 400);
    payload = parsed;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const event = String(payload.event ?? "");
  if (event !== "OPENPIX:CHARGE_COMPLETED") return json({ ok: true, ignored: true });

  const charge = isObject(payload.charge) ? payload.charge : null;
  const pix = isObject(payload.pix) ? payload.pix : null;
  if (!charge) return json({ error: "charge_missing" }, 400);

  const correlationID = String(charge.correlationID ?? "").trim();
  const amountCents = integer(charge.valueWithDiscount ?? charge.value ?? pix?.value);
  const transactionID = String(charge.transactionID ?? pix?.transactionID ?? charge.identifier ?? "").trim();
  const paidAt = typeof charge.paidAt === "string"
    ? charge.paidAt
    : typeof pix?.time === "string"
      ? pix.time
      : new Date().toISOString();

  if (!correlationID.startsWith("apois-ride-") || !amountCents || !transactionID) {
    return json({ error: "invalid_charge_identity" }, 400);
  }

  const eventId = `woovi:${event}:${transactionID}`;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: existingReceipt, error: receiptLookupError } = await admin
    .from("payment_webhook_receipts")
    .select("id,status")
    .eq("provider_event_id", eventId)
    .maybeSingle();
  if (receiptLookupError) {
    console.error("[woovi-webhook] receipt lookup", receiptLookupError);
    return json({ error: "webhook_receipt_lookup_failed" }, 500);
  }
  if (existingReceipt?.status === "processed") return json({ ok: true, duplicate: true });

  if (!existingReceipt) {
    const { error: insertReceiptError } = await admin.from("payment_webhook_receipts").insert({
      provider: "woovi",
      provider_event_id: eventId,
      event_key: correlationID,
      request_id: req.headers.get("x-request-id"),
      status: "pending",
      raw_payload: payload,
    });
    if (insertReceiptError && insertReceiptError.code !== "23505") {
      console.error("[woovi-webhook] receipt reserve", insertReceiptError);
      return json({ error: "webhook_receipt_reserve_failed" }, 500);
    }
  }

  try {
    const { data: payment, error: paymentError } = await admin
      .from("ride_pix_payments")
      .select("ride_id,amount_cents,status,provider_payment_id")
      .eq("provider", "woovi")
      .eq("external_reference", correlationID)
      .maybeSingle();
    if (paymentError) throw new Error(`payment_lookup_failed:${paymentError.message}`);
    if (!payment) throw new Error("payment_not_found");
    if (Number(payment.amount_cents) !== amountCents) throw new Error("payment_amount_mismatch");

    const { data: ride, error: rideError } = await admin
      .from("rides")
      .select("id,payment_method,payment_status,payment_provider,provider_payment_id,passenger_charge_cents,status")
      .eq("id", payment.ride_id)
      .maybeSingle();
    if (rideError) throw new Error(`ride_lookup_failed:${rideError.message}`);
    if (!ride) throw new Error("ride_not_found");
    if (String(ride.payment_method ?? "").toLowerCase() !== "pix") throw new Error("ride_not_pix");
    if (Number(ride.passenger_charge_cents) !== amountCents) throw new Error("ride_payment_amount_mismatch");

    if (ride.provider_payment_id && ride.provider_payment_id !== correlationID) {
      await admin.from("payment_webhook_receipts").update({
        status: "processed",
        detail: "stale_charge_ignored",
        processed_at: new Date().toISOString(),
      }).eq("provider_event_id", eventId);
      return json({ ok: true, stale: true });
    }

    const { error: updatePaymentError } = await admin.from("ride_pix_payments").update({
      provider_payment_id: correlationID,
      status: "received",
      paid_at: paidAt,
      updated_at: new Date().toISOString(),
    }).eq("ride_id", payment.ride_id).eq("external_reference", correlationID);
    if (updatePaymentError) throw new Error(`payment_update_failed:${updatePaymentError.message}`);

    const { data: activation, error: activationError } = await admin.rpc("activate_prepaid_pix_ride", {
      _ride_id: payment.ride_id,
      _provider_payment_id: correlationID,
    });
    if (activationError) throw new Error(`ride_activation_failed:${activationError.message}`);

    const result = isObject(activation) ? activation : {};
    if (result.should_dispatch === true) {
      const { data: claimed, error: claimError } = await admin.rpc("claim_prepaid_pix_initial_dispatch", {
        _ride_id: payment.ride_id,
      });
      if (claimError) throw new Error(`dispatch_claim_failed:${claimError.message}`);
      if (claimed === true) await invokeDispatch();
    }

    const { error: completeReceiptError } = await admin.from("payment_webhook_receipts").update({
      status: "processed",
      detail: "ride_pix_confirmed",
      processed_at: new Date().toISOString(),
    }).eq("provider_event_id", eventId);
    if (completeReceiptError) console.error("[woovi-webhook] receipt complete", completeReceiptError);

    return json({ ok: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 500) : "unknown_error";
    console.error("[woovi-webhook]", detail);
    await admin.from("payment_webhook_receipts").update({
      status: "error",
      detail,
      processed_at: new Date().toISOString(),
    }).eq("provider_event_id", eventId);
    return json({ error: "webhook_processing_failed" }, 500);
  }
});
