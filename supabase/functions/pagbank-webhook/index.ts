import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  PAGBANK_ENVIRONMENT,
  pagbankAccessToken,
  pagbankConfigured,
  secureEqualHex,
  sha256Hex,
} from "../_shared/pagbank.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type PagBankOrder = {
  id?: string;
  reference_id?: string;
  qr_codes?: Array<{
    id?: string;
    expiration_date?: string;
    amount?: { value?: number };
    text?: string;
  }>;
  charges?: Array<{
    id?: string;
    status?: string;
    paid_at?: string;
    amount?: {
      value?: number;
      summary?: { total?: number; paid?: number; refunded?: number };
    };
    payment_method?: {
      type?: string;
      pix?: { end_to_end_id?: string };
    };
  }>;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function orderAmountCents(payload: PagBankOrder): number {
  const paidPixCharge = payload.charges?.find((charge) => String(charge.payment_method?.type ?? "").toUpperCase() === "PIX");
  const chargeAmount = Number(paidPixCharge?.amount?.value);
  if (Number.isSafeInteger(chargeAmount) && chargeAmount > 0) return chargeAmount;
  const qrAmount = Number(payload.qr_codes?.[0]?.amount?.value);
  return Number.isSafeInteger(qrAmount) && qrAmount > 0 ? qrAmount : 0;
}

function pixCharge(payload: PagBankOrder) {
  return payload.charges?.find((charge) => String(charge.payment_method?.type ?? "").toUpperCase() === "PIX") ?? null;
}

async function dispatchPaidPix(rideId: string) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/passenger-ride-request`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
      "content-type": "application/json",
    },
    body: JSON.stringify({ action: "dispatch_paid_pix", ride_id: rideId }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`paid_pix_dispatch_failed:${response.status}:${detail.slice(0, 300)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!pagbankConfigured()) return json({ error: "pagbank_not_configured", environment: PAGBANK_ENVIRONMENT }, 503);

  const rawBody = await req.text();
  const incomingSignature = (req.headers.get("x-authenticity-token") ?? "").trim();
  if (!incomingSignature) return json({ error: "missing_authenticity_token" }, 401);

  const expectedSignature = await sha256Hex(`${pagbankAccessToken()}-${rawBody}`);
  if (!secureEqualHex(incomingSignature, expectedSignature)) {
    return json({ error: "invalid_authenticity_token" }, 401);
  }

  let payload: PagBankOrder;
  try {
    payload = JSON.parse(rawBody) as PagBankOrder;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const orderId = String(payload.id ?? "").trim();
  const referenceId = String(payload.reference_id ?? "").trim();
  if (!orderId.startsWith("ORDE_")) return json({ error: "invalid_order_id" }, 400);

  const bodyHash = await sha256Hex(rawBody);
  const eventKey = `pagbank:${bodyHash}`;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: existing, error: existingError } = await admin
    .from("payment_webhook_receipts")
    .select("id,status")
    .eq("event_key", eventKey)
    .maybeSingle();
  if (existingError) return json({ error: "webhook_receipt_lookup_failed" }, 500);
  if (existing?.status === "processed" || existing?.status === "ignored") {
    return json({ ok: true, duplicate: true });
  }

  const nowIso = new Date().toISOString();
  const { data: receipt, error: receiptError } = await admin
    .from("payment_webhook_receipts")
    .upsert({
      provider: "pagbank",
      event_key: eventKey,
      request_id: req.headers.get("x-product-id") ?? orderId,
      status: "processing",
      detail: null,
      raw_payload: payload,
      processed_at: null,
    }, { onConflict: "event_key" })
    .select("id")
    .single();
  if (receiptError) return json({ error: "webhook_receipt_persist_failed" }, 500);

  try {
    let paymentQuery = admin
      .from("ride_pix_payments")
      .select("id,ride_id,provider,provider_payment_id,amount_cents,status,external_reference,refunded_amount_cents")
      .eq("provider", "pagbank");

    if (referenceId) paymentQuery = paymentQuery.eq("external_reference", referenceId);
    else paymentQuery = paymentQuery.eq("provider_payment_id", orderId);

    const { data: payment, error: paymentError } = await paymentQuery.maybeSingle();
    if (paymentError) throw paymentError;

    if (!payment) {
      await admin
        .from("payment_webhook_receipts")
        .update({ status: "ignored", detail: "ride_payment_not_found", processed_at: nowIso })
        .eq("id", receipt.id);
      return json({ ok: true, ignored: true });
    }

    if (payment.provider_payment_id && payment.provider_payment_id !== orderId) {
      throw new Error("pagbank_order_identity_mismatch");
    }

    const grossCents = orderAmountCents(payload);
    if (grossCents <= 0 || grossCents !== Number(payment.amount_cents)) {
      throw new Error(`pagbank_ride_payment_amount_mismatch:${grossCents}:${payment.amount_cents}`);
    }

    if (!payment.provider_payment_id) {
      const { error: identityError } = await admin
        .from("ride_pix_payments")
        .update({ provider_payment_id: orderId, updated_at: nowIso })
        .eq("id", payment.id)
        .is("provider_payment_id", null);
      if (identityError) throw identityError;
    }

    const charge = pixCharge(payload);
    const chargeStatus = String(charge?.status ?? "").toUpperCase();
    const paidCents = Number(charge?.amount?.summary?.paid ?? 0);
    const refundedCents = Number(charge?.amount?.summary?.refunded ?? 0);

    if (!Number.isSafeInteger(refundedCents) || refundedCents < 0 || refundedCents > Number(payment.amount_cents)) {
      throw new Error(`pagbank_refunded_amount_invalid:${refundedCents}:${payment.amount_cents}`);
    }

    // PagBank keeps a partially-refunded charge in PAID status. The cumulative
    // amount.summary.refunded is therefore authoritative and must be handled
    // before the PAID branch. The RPC stores the cumulative refund and debits
    // only the driver-fare portion, once, if a settlement already exists.
    if (refundedCents > 0) {
      const { data: refundResult, error: refundError } = await admin.rpc("reconcile_pagbank_ride_refund", {
        _ride_id: payment.ride_id,
        _provider_payment_id: orderId,
        _refunded_amount_cents: refundedCents,
      });
      if (refundError) throw refundError;

      const fullRefund = refundedCents === Number(payment.amount_cents);
      await admin
        .from("payment_webhook_receipts")
        .update({
          status: "processed",
          detail: fullRefund ? "ride_payment_refunded" : "ride_payment_partially_refunded",
          processed_at: nowIso,
        })
        .eq("id", receipt.id);
      return json({
        ok: true,
        kind: "ride_payment",
        status: fullRefund ? "refunded" : "partially_refunded",
        refundedAmountCents: refundedCents,
        reconciliation: refundResult,
      });
    }

    if (chargeStatus === "PAID") {
      if (paidCents > 0 && paidCents !== Number(payment.amount_cents)) {
        throw new Error(`pagbank_paid_amount_mismatch:${paidCents}:${payment.amount_cents}`);
      }

      const { error: paymentUpdateError } = await admin
        .from("ride_pix_payments")
        .update({
          provider_payment_id: orderId,
          status: "received",
          paid_at: charge?.paid_at ?? nowIso,
          updated_at: nowIso,
        })
        .eq("id", payment.id);
      if (paymentUpdateError) throw paymentUpdateError;

      const { data: activation, error: activationError } = await admin.rpc("activate_prepaid_pix_ride", {
        _ride_id: payment.ride_id,
        _provider_payment_id: orderId,
      });
      if (activationError) throw activationError;
      if (activation?.should_dispatch) await dispatchPaidPix(payment.ride_id);

      await admin
        .from("payment_webhook_receipts")
        .update({ status: "processed", detail: "ride_payment_received", processed_at: nowIso })
        .eq("id", receipt.id);
      return json({ ok: true, kind: "ride_payment", status: "received", dispatch: Boolean(activation?.should_dispatch) });
    }

    if (chargeStatus === "CANCELED" || chargeStatus === "DECLINED") {
      const canonicalStatus = chargeStatus === "CANCELED" ? "cancelled" : "failed";
      const ridePaymentStatus = chargeStatus === "CANCELED" ? "expired" : "failed";
      const { error: paymentUpdateError } = await admin
        .from("ride_pix_payments")
        .update({ status: canonicalStatus, updated_at: nowIso })
        .eq("id", payment.id)
        .neq("status", "received");
      if (paymentUpdateError) throw paymentUpdateError;

      const { error: rideUpdateError } = await admin
        .from("rides")
        .update({ payment_status: ridePaymentStatus, updated_at: nowIso })
        .eq("id", payment.ride_id)
        .eq("status", "aguardando_pagamento")
        .eq("provider_payment_id", orderId)
        .neq("payment_status", "paid");
      if (rideUpdateError) throw rideUpdateError;

      await admin
        .from("payment_webhook_receipts")
        .update({ status: "processed", detail: `ride_payment_${canonicalStatus}`, processed_at: nowIso })
        .eq("id", receipt.id);
      return json({ ok: true, kind: "ride_payment", status: canonicalStatus });
    }

    await admin
      .from("payment_webhook_receipts")
      .update({ status: "processed", detail: chargeStatus ? `ride_payment_${chargeStatus.toLowerCase()}` : "ride_order_update", processed_at: nowIso })
      .eq("id", receipt.id);
    return json({ ok: true, kind: "ride_payment", status: chargeStatus || "order_update" });
  } catch (error) {
    const detail = String(error).slice(0, 800);
    console.error("[pagbank-webhook]", detail);
    await admin
      .from("payment_webhook_receipts")
      .update({ status: "failed", detail, processed_at: nowIso })
      .eq("id", receipt.id);
    return json({ error: "processing_failed" }, 500);
  }
});
