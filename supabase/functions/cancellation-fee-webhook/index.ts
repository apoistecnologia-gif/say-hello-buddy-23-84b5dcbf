import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MP_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN")?.trim() ?? "";
const MP_SECRET = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET")?.trim() ?? "";
const MP_BASE = (Deno.env.get("MERCADOPAGO_BASE_URL")?.trim() || "https://api.mercadopago.com").replace(/\/+$/, "");

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

function signatureParts(signature: string): Record<string, string> {
  return Object.fromEntries(
    signature.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")];
    }),
  );
}

async function validSignature(
  dataId: string,
  requestId: string,
  signature: string,
): Promise<boolean> {
  if (!MP_SECRET || !dataId || !requestId || !signature) return false;

  const parts = signatureParts(signature);
  const timestampRaw = Number(parts.ts);
  const received = String(parts.v1 ?? "").toLowerCase();
  if (!Number.isFinite(timestampRaw) || !received) return false;

  const timestampMs = timestampRaw > 1_000_000_000_000
    ? timestampRaw
    : timestampRaw * 1000;
  if (Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(MP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`;
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(manifest),
  );
  const expected = Array.from(new Uint8Array(signed))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return safeEqual(expected, received);
}

type NormalizedResource = {
  feeId: string;
  amount: number;
  providerResourceId: string;
  orderId: string | null;
  orderStatus: string | null;
  orderStatusDetail: string | null;
  paymentId: string | null;
  paymentStatus: string | null;
  paid: boolean;
  reversed: boolean;
};

function feeIdFromReference(reference: unknown): string {
  const value = String(reference ?? "");
  return value.startsWith("fee:") ? value.slice(4) : "";
}

function isPaidStatus(status: unknown, detail: unknown): boolean {
  const normalizedStatus = String(status ?? "").toLowerCase();
  const normalizedDetail = String(detail ?? "").toLowerCase();
  return normalizedStatus === "processed" && normalizedDetail === "accredited";
}

function isReversedStatus(status: unknown, detail: unknown): boolean {
  const combined = `${String(status ?? "").toLowerCase()} ${String(detail ?? "").toLowerCase()}`;
  return [
    "refunded",
    "partially_refunded",
    "charged_back",
    "chargeback",
  ].some((value) => combined.includes(value));
}

async function loadOrder(orderId: string): Promise<NormalizedResource> {
  const response = await fetch(`${MP_BASE}/v1/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${MP_TOKEN}` },
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`MP_ORDER_HTTP_${response.status}`);

  const order = JSON.parse(raw) as {
    id?: string;
    external_reference?: string;
    total_amount?: string | number;
    status?: string;
    status_detail?: string;
    transactions?: {
      payments?: Array<{
        id?: string;
        amount?: string | number;
        status?: string;
        status_detail?: string;
      }>;
    };
  };
  const payment = order.transactions?.payments?.[0];
  const feeId = feeIdFromReference(order.external_reference);
  if (!feeId) throw new Error("fee_reference_missing");

  return {
    feeId,
    amount: Number(order.total_amount ?? payment?.amount ?? 0),
    providerResourceId: String(order.id ?? orderId),
    orderId: String(order.id ?? orderId),
    orderStatus: String(order.status ?? ""),
    orderStatusDetail: String(order.status_detail ?? ""),
    paymentId: payment?.id ? String(payment.id) : null,
    paymentStatus: payment?.status ? String(payment.status) : null,
    paid:
      isPaidStatus(order.status, order.status_detail) ||
      isPaidStatus(payment?.status, payment?.status_detail),
    reversed:
      isReversedStatus(order.status, order.status_detail) ||
      isReversedStatus(payment?.status, payment?.status_detail),
  };
}

async function loadLegacyPayment(paymentId: string): Promise<NormalizedResource> {
  const response = await fetch(
    `${MP_BASE}/v1/payments/${encodeURIComponent(paymentId)}`,
    { headers: { Authorization: `Bearer ${MP_TOKEN}` } },
  );
  const raw = await response.text();
  if (!response.ok) throw new Error(`MP_PAYMENT_HTTP_${response.status}`);

  const payment = JSON.parse(raw) as {
    id?: string | number;
    external_reference?: string;
    transaction_amount?: number;
    status?: string;
    metadata?: { fee_id?: string; kind?: string };
  };
  const referenceFeeId = feeIdFromReference(payment.external_reference);
  const metadataFeeId = String(payment.metadata?.fee_id ?? "");
  if (
    payment.metadata?.kind !== "cancellation_fee" &&
    !referenceFeeId
  ) {
    throw new Error("not_a_cancellation_fee");
  }
  if (metadataFeeId && referenceFeeId && metadataFeeId !== referenceFeeId) {
    throw new Error("fee_reference_mismatch");
  }
  const feeId = metadataFeeId || referenceFeeId;
  if (!feeId) throw new Error("fee_reference_missing");

  const status = String(payment.status ?? "");
  return {
    feeId,
    amount: Number(payment.transaction_amount ?? 0),
    providerResourceId: String(payment.id ?? paymentId),
    orderId: null,
    orderStatus: null,
    orderStatusDetail: null,
    paymentId: String(payment.id ?? paymentId),
    paymentStatus: status,
    paid: status === "approved",
    reversed: ["refunded", "charged_back"].includes(status),
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!MP_TOKEN || !MP_SECRET) {
    return json({ error: "mercadopago_configuration_missing" }, 503);
  }

  let payload: {
    type?: string;
    action?: string;
    data?: { id?: string | number };
    id?: string | number;
  } = {};
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const url = new URL(req.url);
  const eventType = String(
    payload.type ??
      url.searchParams.get("type") ??
      url.searchParams.get("topic") ??
      "",
  ).toLowerCase();
  const dataId = String(
    payload.data?.id ??
      payload.id ??
      url.searchParams.get("data.id") ??
      url.searchParams.get("id") ??
      "",
  );
  if (!eventType || !dataId) {
    return json({ ok: true, ignored: "missing_event_identity" });
  }

  const requestId = req.headers.get("x-request-id") ?? "";
  const signature = req.headers.get("x-signature") ?? "";
  if (!(await validSignature(dataId, requestId, signature).catch(() => false))) {
    return json({ error: "invalid_signature" }, 401);
  }

  if (eventType === "order" && !/^ORD[A-Z0-9]{18,}$/i.test(dataId)) {
    return json({
      ok: true,
      verified: true,
      ignored: "simulation_without_real_order_id",
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ts = signatureParts(signature).ts ?? "";
  const eventKey = `cancellation_fee:${eventType}:${payload.action ?? ""}:${dataId}:${ts}`;
  const { data: receipt, error: receiptError } = await admin
    .from("payment_webhook_receipts")
    .insert({
      provider: "mercadopago",
      event_key: eventKey,
      request_id: requestId,
      status: "processing",
      raw_payload: payload,
    })
    .select("id")
    .single();

  if (receiptError?.code === "23505") {
    return json({ ok: true, duplicate: true });
  }
  if (receiptError || !receipt) {
    return json({ error: "receipt_write_failed" }, 500);
  }

  const finish = async (status: string, detail?: string) => {
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
    if (!new Set(["order", "payment"]).has(eventType)) {
      await finish("ignored", `unsupported_type:${eventType}`);
      return json({ ok: true, ignored: eventType });
    }

    const resource = eventType === "order"
      ? await loadOrder(dataId)
      : await loadLegacyPayment(dataId);

    const { data: fee, error: feeError } = await admin
      .from("cancellation_fees")
      .select("id,passenger_id,amount,is_paid,status")
      .eq("id", resource.feeId)
      .maybeSingle();
    if (feeError || !fee) throw new Error("fee_not_found");

    const expected = Number(fee.amount ?? 0);
    if (!(expected > 0) || Math.abs(expected - resource.amount) > 0.01) {
      await finish("rejected", "amount_mismatch");
      return json({ error: "amount_mismatch" }, 422);
    }

    const alreadyPaid = fee.is_paid === true || fee.status === "paid";
    const { error: updateError } = await admin
      .from("cancellation_fees")
      .update({
        provider: "mercadopago",
        provider_payment_id: resource.paymentId || resource.providerResourceId,
        mp_order_id: resource.orderId,
        mp_order_status: resource.orderStatus,
        mp_order_status_detail: resource.orderStatusDetail,
        mp_payment_id: resource.paymentId,
        mp_payment_status: resource.paymentStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", resource.feeId);
    if (updateError) throw new Error(`fee_update_failed:${updateError.message}`);

    if (resource.paid && !alreadyPaid) {
      const { error } = await admin.rpc("settle_cancellation_fee", {
        _fee_id: resource.feeId,
      });
      if (error) throw new Error(`settlement_failed:${error.message}`);
    }

    if (resource.reversed && alreadyPaid) {
      const { error } = await admin.rpc(
        "reverse_cancellation_fee_settlement",
        { _fee_id: resource.feeId },
      );
      if (error) throw new Error(`reversal_failed:${error.message}`);
    }

    await finish(
      "processed",
      `fee:${resource.feeId};type:${eventType};paid:${resource.paid};reversed:${resource.reversed}`,
    );
    return json({
      ok: true,
      processed: "cancellation_fee",
      feeId: resource.feeId,
      type: eventType,
      paid: resource.paid,
      reversed: resource.reversed,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("cancellation_fee_webhook_failed", detail);
    await finish("error", detail);
    return json({ error: "processing_failed" }, 500);
  }
});
