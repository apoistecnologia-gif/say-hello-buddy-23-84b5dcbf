import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_AUTHORIZATION = (Deno.env.get("WOOVI_WEBHOOK_AUTHORIZATION") ?? "").trim();

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

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!WEBHOOK_AUTHORIZATION) return json({ error: "webhook_not_configured" }, 503);

  const supplied = (req.headers.get("authorization") ?? "").trim();
  if (!supplied || !constantTimeEqual(supplied, WEBHOOK_AUTHORIZATION)) {
    return json({ error: "unauthorized" }, 401);
  }

  let payload: JsonObject;
  try {
    const parsed = await req.json();
    payload = isObject(parsed) ? parsed : {};
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const event = text(payload.event)?.toUpperCase() ?? "";
  if (!["OPENPIX:MOVEMENT_CONFIRMED", "OPENPIX:MOVEMENT_FAILED", "OPENPIX:MOVEMENT_REMOVED"].includes(event)) {
    return json({ ok: true, ignored: true, event });
  }

  const payment = isObject(payload.payment) ? payload.payment : {};
  const transaction = isObject(payload.transaction) ? payload.transaction : {};
  const correlationId =
    text(payment.correlationID) ??
    text(payment.correlationId) ??
    text(transaction.correlationID) ??
    text(transaction.correlationId);
  if (!correlationId) return json({ error: "correlation_id_missing" }, 422);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: withdrawal, error: lookupError } = await admin
    .from("driver_withdrawals")
    .select("id,amount,status,provider,provider_transfer_id")
    .eq("provider", "woovi")
    .eq("provider_transfer_id", correlationId)
    .maybeSingle();
  if (lookupError) return json({ error: "withdrawal_lookup_failed" }, 500);
  if (!withdrawal) return json({ ok: true, ignored: true, reason: "withdrawal_not_found" });

  const webhookAmount = Number(payment.value ?? transaction.value);
  const expectedCents = Math.round(Number(withdrawal.amount) * 100);
  if (Number.isFinite(webhookAmount) && Math.round(webhookAmount) !== expectedCents) {
    console.error("[woovi-payout-webhook] amount mismatch", {
      withdrawalId: withdrawal.id,
      expectedCents,
      webhookAmount,
    });
    return json({ error: "withdrawal_amount_mismatch" }, 422);
  }

  if (event === "OPENPIX:MOVEMENT_CONFIRMED") {
    const endToEndId = text(transaction.endToEndId) ?? text(transaction.end_to_end_id);
    const { error } = await admin.rpc("mark_driver_withdrawal_paid", {
      _withdrawal_id: withdrawal.id,
      _transfer_id: correlationId,
      _end_to_end_id: endToEndId,
      _response: payload as never,
    });
    if (error) {
      if (withdrawal.status === "paid") return json({ ok: true, duplicate: true });
      console.error("[woovi-payout-webhook] confirm failed", error);
      return json({ error: "withdrawal_confirm_failed" }, 500);
    }
    return json({ ok: true, status: "paid", withdrawalId: withdrawal.id });
  }

  if (withdrawal.status === "failed") return json({ ok: true, duplicate: true });
  if (withdrawal.status === "paid") {
    console.error("[woovi-payout-webhook] terminal conflict", {
      withdrawalId: withdrawal.id,
      event,
    });
    return json({ error: "paid_withdrawal_received_failure_event" }, 409);
  }

  const errorObject = isObject(payload.error) ? payload.error : {};
  const reason = [
    event,
    text(errorObject.code),
    text(errorObject.description),
    text(transaction.providerRejectedReason),
  ].filter((value): value is string => Boolean(value)).join(": ").slice(0, 1000);

  const { error } = await admin.rpc("mark_driver_withdrawal_failed", {
    _withdrawal_id: withdrawal.id,
    _reason: reason || "woovi_payout_failed",
    _response: payload as never,
  });
  if (error) {
    console.error("[woovi-payout-webhook] failure reconciliation failed", error);
    return json({ error: "withdrawal_failure_reconciliation_failed" }, 500);
  }

  return json({ ok: true, status: "failed", refunded: true, withdrawalId: withdrawal.id });
});
