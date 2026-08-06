import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MP_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN")?.trim() ?? "";
const MP_SECRET = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET")?.trim() ?? "";
const MP_BASE = (Deno.env.get("MERCADOPAGO_BASE_URL")?.trim() || "https://api.mercadopago.com").replace(/\/+$/, "");

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function validSignature(dataId: string, requestId: string, signature: string): Promise<boolean> {
  if (!MP_SECRET || !dataId || !requestId || !signature) return false;
  const parts = Object.fromEntries(signature.split(",").map((part) => {
    const [key, ...rest] = part.trim().split("=");
    return [key, rest.join("=")];
  }));
  const timestamp = Number(parts.ts);
  const received = String(parts.v1 ?? "").toLowerCase();
  if (!Number.isFinite(timestamp) || !received || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(MP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`;
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const expected = Array.from(new Uint8Array(signed)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return safeEqual(expected, received);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!MP_TOKEN || !MP_SECRET) return json({ error: "mercadopago_configuration_missing" }, 503);

  let payload: { type?: string; action?: string; data?: { id?: string | number }; id?: string | number } = {};
  try { payload = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const url = new URL(req.url);
  const eventType = String(payload.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "");
  const dataId = String(payload.data?.id ?? payload.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");
  if (!eventType || !dataId) return json({ ok: true, ignored: "missing_event_identity" });

  const requestId = req.headers.get("x-request-id") ?? "";
  const signature = req.headers.get("x-signature") ?? "";
  if (!(await validSignature(dataId, requestId, signature).catch(() => false))) return json({ error: "invalid_signature" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const ts = signature.split(",").map((item) => item.trim()).find((item) => item.startsWith("ts="))?.slice(3) ?? "";
  const eventKey = `cancellation_fee:${eventType}:${payload.action ?? ""}:${dataId}:${ts}`;
  const { data: receipt, error: receiptError } = await admin.from("payment_webhook_receipts").insert({
    provider: "mercadopago",
    event_key: eventKey,
    request_id: requestId,
    status: "processing",
    raw_payload: payload,
  }).select("id").single();
  if (receiptError?.code === "23505") return json({ ok: true, duplicate: true });
  if (receiptError || !receipt) return json({ error: "receipt_write_failed" }, 500);

  const finish = async (status: string, detail?: string) => {
    await admin.from("payment_webhook_receipts").update({ status, detail: detail?.slice(0, 500) ?? null, processed_at: new Date().toISOString() }).eq("id", receipt.id);
  };

  try {
    if (eventType !== "payment") {
      await finish("ignored", `unsupported_type:${eventType}`);
      return json({ ok: true, ignored: eventType });
    }
    const paymentResponse = await fetch(`${MP_BASE}/v1/payments/${dataId}`, { headers: { Authorization: `Bearer ${MP_TOKEN}` } });
    const raw = await paymentResponse.text();
    if (!paymentResponse.ok) throw new Error(`MP_HTTP_${paymentResponse.status}`);
    const payment = JSON.parse(raw);
    const externalReference = String(payment.external_reference ?? "");
    const metadataKind = String(payment.metadata?.kind ?? "");
    if (metadataKind !== "cancellation_fee" && !externalReference.startsWith("fee:")) {
      await finish("ignored", "not_a_cancellation_fee");
      return json({ ok: true, ignored: "not_a_cancellation_fee" });
    }
    const metadataFeeId = String(payment.metadata?.fee_id ?? "");
    const referenceFeeId = externalReference.startsWith("fee:") ? externalReference.slice(4) : "";
    const feeId = metadataFeeId || referenceFeeId;
    if (!feeId || (metadataFeeId && referenceFeeId && metadataFeeId !== referenceFeeId)) {
      await finish("rejected", "fee_reference_mismatch");
      return json({ error: "fee_reference_mismatch" }, 422);
    }

    const { data: fee, error: feeError } = await admin.from("cancellation_fees").select("id,passenger_id,amount,is_paid,status").eq("id", feeId).maybeSingle();
    if (feeError || !fee) throw new Error("fee_not_found");
    const expected = Number(fee.amount ?? 0);
    const received = Number(payment.transaction_amount ?? 0);
    if (!(expected > 0) || Math.abs(expected - received) > 0.01) {
      await finish("rejected", "amount_mismatch");
      return json({ error: "amount_mismatch" }, 422);
    }

    const alreadyPaid = fee.is_paid === true || fee.status === "paid";
    await admin.from("cancellation_fees").update({
      provider: "mercadopago",
      provider_payment_id: String(payment.id),
      mp_payment_id: String(payment.id),
      mp_payment_status: String(payment.status),
      updated_at: new Date().toISOString(),
    }).eq("id", feeId);

    if (payment.status === "approved" && !alreadyPaid) {
      const { error } = await admin.rpc("settle_cancellation_fee", { _fee_id: feeId });
      if (error) throw new Error(`settlement_failed:${error.message}`);
    }
    if (["refunded", "charged_back"].includes(String(payment.status)) && alreadyPaid) {
      const { error } = await admin.rpc("reverse_cancellation_fee_settlement", { _fee_id: feeId });
      if (error) throw new Error(`reversal_failed:${error.message}`);
    }

    await finish("processed", `fee:${feeId};status:${payment.status}`);
    return json({ ok: true, processed: "cancellation_fee", feeId, status: payment.status });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("cancellation_fee_webhook_failed", detail);
    await finish("error", detail);
    return json({ error: "processing_failed" }, 500);
  }
});