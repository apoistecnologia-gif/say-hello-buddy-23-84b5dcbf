import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_AUTHORIZATION = (Deno.env.get("WOOVI_WEBHOOK_AUTHORIZATION") ?? "").trim();

type JsonObject = Record<string, unknown>;
type WithdrawalRow = {
  id: string;
  amount: number;
  status: string;
  provider: string | null;
  provider_transfer_id: string | null;
  pix_key: string | null;
  requested_at: string | null;
};

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

function webhookAuthorization(req: Request): string {
  return (
    req.headers.get("x-openpix-authorization") ??
    req.headers.get("authorization") ??
    ""
  ).trim();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!WEBHOOK_AUTHORIZATION) return json({ error: "webhook_not_configured" }, 503);

  const supplied = webhookAuthorization(req);
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

  const destinationAlias =
    text(payment.destinationAlias) ??
    text(transaction.destinationAlias);
  const webhookAmount = Number(payment.value ?? transaction.value);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let withdrawal: WithdrawalRow | null = null;
  const { data: directWithdrawal, error: lookupError } = await admin
    .from("driver_withdrawals")
    .select("id,amount,status,provider,provider_transfer_id,pix_key,requested_at")
    .eq("provider", "woovi")
    .eq("provider_transfer_id", correlationId)
    .maybeSingle();
  if (lookupError) return json({ error: "withdrawal_lookup_failed" }, 500);
  if (directWithdrawal) withdrawal = directWithdrawal as WithdrawalRow;

  // If our original HTTP response was lost, provider_transfer_id may not have
  // reached the database even though Woovi created the movement. The payout
  // RPC allows only one in-flight withdrawal per driver, and Pix keys are
  // unique among Woovi driver payment accounts. Therefore an exact match on
  // processing + destination Pix key + amount within the recent window is a
  // safe recovery path. We refuse ambiguous matches instead of guessing.
  if (!withdrawal && destinationAlias && Number.isFinite(webhookAmount)) {
    const expectedAmount = Math.round(webhookAmount) / 100;
    const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: candidates, error: candidateError } = await admin
      .from("driver_withdrawals")
      .select("id,amount,status,provider,provider_transfer_id,pix_key,requested_at")
      .eq("provider", "woovi")
      .eq("status", "processing")
      .eq("pix_key", destinationAlias)
      .eq("amount", expectedAmount)
      .gte("requested_at", recentCutoff)
      .order("requested_at", { ascending: false })
      .limit(2);
    if (candidateError) return json({ error: "withdrawal_reconciliation_lookup_failed" }, 500);

    if ((candidates?.length ?? 0) > 1) {
      console.error("[woovi-payout-webhook] ambiguous fallback match", {
        correlationId,
        destinationAlias,
        webhookAmount,
        candidateIds: candidates?.map((candidate) => candidate.id),
      });
      return json({ error: "withdrawal_reconciliation_ambiguous" }, 409);
    }

    if (candidates?.length === 1) {
      withdrawal = candidates[0] as WithdrawalRow;
      const { error: bindError } = await admin
        .from("driver_withdrawals")
        .update({
          provider_transfer_id: correlationId,
          failure_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", withdrawal.id)
        .eq("status", "processing")
        .is("provider_transfer_id", null);
      if (bindError) {
        console.error("[woovi-payout-webhook] fallback binding failed", bindError);
        return json({ error: "withdrawal_reconciliation_bind_failed" }, 500);
      }
      withdrawal.provider_transfer_id = correlationId;
    }
  }

  if (!withdrawal) return json({ ok: true, ignored: true, reason: "withdrawal_not_found" });

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