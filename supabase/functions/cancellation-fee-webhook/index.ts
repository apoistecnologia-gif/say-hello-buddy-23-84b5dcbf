import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";
import { mercadoPagoBaseUrl } from "../_shared/mercadopago.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN")?.trim() ?? "";
const MP_WEBHOOK_SECRET = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET")?.trim() ?? "";
const MAX_SIGNATURE_AGE_SECONDS = 300;

function json(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(req ? getCorsHeaders(req) : {}),
      "content-type": "application/json",
    },
  });
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
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

async function verifySignature(
  dataId: string,
  requestId: string,
  signature: string,
): Promise<boolean> {
  if (!MP_WEBHOOK_SECRET || !signature || !requestId) return false;

  const parts = Object.fromEntries(
    signature.split(",").map((part) => {
      const [key, ...value] = part.trim().split("=");
      return [key, value.join("=")];
    }),
  );
  const timestampText = parts.ts;
  const receivedHash = parts.v1?.toLowerCase();
  const timestamp = Number(timestampText);

  if (!timestampText || !receivedHash || !Number.isFinite(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > MAX_SIGNATURE_AGE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(MP_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const manifest = `id:${dataId};request-id:${requestId};ts:${timestampText};`;
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const expectedHash = Array.from(new Uint8Array(signed))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return safeEqual(expectedHash, receivedHash);
}

async function fetchPayment(paymentId: string): Promise<{
  id: number;
  status: string;
  status_detail?: string;
  transaction_amount?: number;
  date_approved?: string | null;
  external_reference?: string | null;
  metadata?: Record<string, unknown>;
}> {
  if (!MP_TOKEN) throw new Error("MERCADOPAGO_ACCESS_TOKEN_MISSING");
  const response = await fetch(`${mercadoPagoBaseUrl()}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${MP_TOKEN}` },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`MP_HTTP_${response.status}:${text.slice(0, 300)}`);
  return JSON.parse(text);
}

function normalizedAmount(fee: Record<string, unknown>): number {
  const candidates = [fee["amount"], fee["fee_amount"], fee["value"]];
  for (const candidate of candidates) {
    const amount = Number(candidate);
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  return 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, req);
  if (!MP_WEBHOOK_SECRET) return json({ error: "webhook_secret_not_configured" }, 503, req);

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
    return json({ error: "invalid_json" }, 400, req);
  }

  const url = new URL(req.url);
  const eventType = String(
    payload.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "",
  );
  const dataId = String(
    payload.data?.id ??
      payload.id ??
      url.searchParams.get("data.id") ??
      url.searchParams.get("id") ??
      "",
  );

  if (!eventType || !dataId) {
    return json({ ok: true, ignored: "missing_event_identity" }, 200, req);
  }

  const requestId = req.headers.get("x-request-id") ?? "";
  const signature = req.headers.get("x-signature") ?? "";
  const signatureIsValid = await verifySignature(dataId, requestId, signature).catch(() => false);
  if (!signatureIsValid) {
    console.error("[fee-webhook] invalid signature", { dataId, requestId });
    return json({ error: "invalid_signature" }, 401, req);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const eventKey = `cancellation_fee:${eventType}:${payload.action ?? ""}:${dataId}:${signatureTimestamp(signature)}`;
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

  if (receiptError?.code === "23505") return json({ ok: true, duplicate: true }, 200, req);
  if (receiptError || !receipt) return json({ error: "receipt_write_failed" }, 500, req);

  const finishReceipt = async (status: string, detail?: string): Promise<void> => {
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
    if (eventType !== "payment") {
      await finishReceipt("ignored", `unsupported_type:${eventType}`);
      return json({ ok: true, ignored: eventType }, 200, req);
    }

    const payment = await fetchPayment(dataId);
    const externalReference = payment.external_reference ?? "";
    const metadataKind = String(payment.metadata?.kind ?? "");
    if (metadataKind !== "cancellation_fee" && !externalReference.startsWith("fee:")) {
      await finishReceipt("ignored", "not_a_cancellation_fee");
      return json({ ok: true, ignored: "not_a_cancellation_fee" }, 200, req);
    }

    const metadataFeeId = String(payment.metadata?.fee_id ?? "");
    const referenceFeeId = externalReference.startsWith("fee:")
      ? externalReference.slice("fee:".length)
      : "";
    const feeId = metadataFeeId || referenceFeeId;
    if (!feeId || (metadataFeeId && referenceFeeId && metadataFeeId !== referenceFeeId)) {
      await finishReceipt("rejected", "fee_reference_mismatch");
      return json({ error: "fee_reference_mismatch" }, 422, req);
    }

    const { data: fee, error: feeError } = await admin
      .from("cancellation_fees")
      .select("id,passenger_id,amount,fee_amount,value,is_paid,status")
      .eq("id", feeId)
      .maybeSingle();
    if (feeError || !fee) throw new Error("CANCELLATION_FEE_NOT_FOUND");

    const expectedAmount = normalizedAmount(fee as Record<string, unknown>);
    const receivedAmount = Number(payment.transaction_amount ?? 0);
    if (expectedAmount <= 0 || Math.abs(receivedAmount - expectedAmount) > 0.01) {
      await finishReceipt("rejected", "cancellation_fee_amount_mismatch");
      return json({ error: "amount_mismatch" }, 422, req);
    }

    const currentStatus = String(fee.status ?? "").toLowerCase();
    const alreadyPaid = fee.is_paid === true || ["paid", "approved", "pago"].includes(currentStatus);

    const { error: paymentPatchError } = await admin
      .from("cancellation_fees")
      .update({
        mp_payment_id: String(payment.id),
        mp_payment_status: payment.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", feeId);
    if (paymentPatchError) throw new Error(`FEE_PAYMENT_PATCH_FAILED:${paymentPatchError.message}`);

    if (payment.status === "approved" && !alreadyPaid) {
      const { error: settlementError } = await admin.rpc("settle_cancellation_fee", {
        _fee_id: feeId,
      });
      if (settlementError) {
        throw new Error(`FEE_SETTLE_FAILED:${settlementError.message}`);
      }
    }

    if (["refunded", "charged_back"].includes(payment.status) && alreadyPaid) {
      const { error: reversalError } = await admin.rpc("reverse_cancellation_fee_settlement", {
        _fee_id: feeId,
      });
      if (reversalError) {
        throw new Error(`FEE_REVERSE_FAILED:${reversalError.message}`);
      }
    }

    await finishReceipt("processed", `fee:${feeId};status:${payment.status}`);
    return json(
      {
        ok: true,
        processed: "cancellation_fee",
        feeId,
        status: payment.status,
      },
      200,
      req,
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[fee-webhook] processing failed", { dataId, detail });
    await finishReceipt("error", detail);
    return json({ error: "processing_failed" }, 500, req);
  }
});
