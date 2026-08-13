import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const WOOVI_APP_ID = (Deno.env.get("WOOVI_APP_ID") ?? "").trim();
const WOOVI_API_BASE_URL = (
  Deno.env.get("WOOVI_API_BASE_URL")?.trim() || "https://api.woovi.com"
).replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 15_000;

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "content-type": "application/json" },
  });

type WithdrawalReservation = {
  withdrawalId?: string;
  status?: string;
  provider?: string;
  amountCents?: number;
  idempotent?: boolean;
};

type Withdrawal = {
  id: string;
  driver_id: string;
  amount: number;
  pix_key: string;
  status: string;
  provider: string | null;
  provider_transfer_id: string | null;
};

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeAmountCents(value: unknown): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  const cents = Math.round(amount * 100);
  if (cents < 2_000 || cents > 5_000_000) return null;
  return cents;
}

function validUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)
    ? normalized
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
  if (!WOOVI_APP_ID) return json(req, { error: "payment_provider_not_configured" }, 503);

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json(req, { error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userResult, error: userError } = await userClient.auth.getUser();
    if (userError || !userResult.user) return json(req, { error: "unauthorized" }, 401);

    let payload: { amount?: unknown; idempotencyKey?: unknown } = {};
    try {
      payload = await req.json();
    } catch {
      return json(req, { error: "invalid_json" }, 400);
    }

    const amountCents = normalizeAmountCents(payload.amount);
    if (amountCents === null) {
      return json(req, {
        error: "invalid_withdrawal_amount",
        detail: "Informe um valor entre R$ 20,00 e R$ 50.000,00.",
      }, 422);
    }

    const idempotencyKey = validUuid(payload.idempotencyKey);
    if (!idempotencyKey) {
      return json(req, {
        error: "idempotency_key_required",
        detail: "A solicitação de saque precisa de uma chave UUID estável para impedir duplicidade.",
      }, 422);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: reservationData, error: reservationError } = await userClient.rpc(
      "driver_request_withdrawal",
      { _amount_cents: amountCents, _idempotency_key: idempotencyKey },
    );
    if (reservationError) {
      return json(req, {
        error: "withdrawal_request_failed",
        detail: reservationError.message,
      }, 422);
    }

    const reservation = (isObject(reservationData) ? reservationData : {}) as WithdrawalReservation;
    const withdrawalId = text(reservation.withdrawalId);
    if (!withdrawalId) return json(req, { error: "withdrawal_reservation_invalid" }, 500);

    if (reservation.idempotent && reservation.status === "paid") {
      return json(req, {
        ok: true,
        idempotent: true,
        withdrawalId,
        status: "paid",
      });
    }

    const { data: withdrawalRow, error: withdrawalError } = await admin
      .from("driver_withdrawals")
      .select("id,driver_id,amount,pix_key,status,provider,provider_transfer_id")
      .eq("id", withdrawalId)
      .maybeSingle();
    if (withdrawalError || !withdrawalRow) {
      return json(req, { error: "withdrawal_not_found" }, 500);
    }
    const withdrawal = withdrawalRow as Withdrawal;

    if (withdrawal.provider !== "woovi" || !withdrawal.pix_key) {
      await admin.rpc("mark_driver_withdrawal_failed", {
        _withdrawal_id: withdrawal.id,
        _reason: "woovi_payment_account_missing",
        _response: null,
      });
      return json(req, { error: "woovi_payment_account_missing", withdrawalId }, 409);
    }

    // Once a payout has entered processing we never call the provider again for
    // the same reservation. A missing provider_transfer_id can mean that the
    // provider accepted the request but our HTTP response was lost. Retrying
    // the withdraw endpoint in that state could pay the driver twice.
    if (withdrawal.status === "processing") {
      return json(req, {
        ok: true,
        pending: true,
        idempotent: true,
        reconciliationRequired: !withdrawal.provider_transfer_id,
        withdrawalId,
        transferId: withdrawal.provider_transfer_id,
        status: "processing",
      }, 202);
    }

    const { error: processingError } = await admin.rpc("mark_driver_withdrawal_processing", {
      _withdrawal_id: withdrawal.id,
    });
    if (processingError) {
      return json(req, { error: "withdrawal_claim_failed", detail: processingError.message }, 409);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    let rawText = "";
    let providerBody: JsonObject = {};
    try {
      response = await fetch(
        `${WOOVI_API_BASE_URL}/api/v1/subaccount/${encodeURIComponent(withdrawal.pix_key)}/withdraw`,
        {
          method: "POST",
          headers: {
            Authorization: WOOVI_APP_ID,
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({ value: amountCents }),
          signal: controller.signal,
        },
      );
      rawText = await response.text();
      try {
        const parsed = rawText ? JSON.parse(rawText) : {};
        providerBody = isObject(parsed) ? parsed : { raw: rawText.slice(0, 1000) };
      } catch {
        providerBody = { raw: rawText.slice(0, 1000) };
      }
    } catch (error) {
      const reason = error instanceof DOMException && error.name === "AbortError"
        ? "provider_timeout_reconciliation_required"
        : `provider_transport_unknown:${String(error).slice(0, 350)}`;

      // A transport failure is an ambiguous outcome: the provider may already
      // have accepted the payout. Keep funds reserved and let the webhook (or
      // an operational reconciliation) decide the terminal state. Never refund
      // an ambiguous payout automatically.
      const { error: persistUnknownError } = await admin
        .from("driver_withdrawals")
        .update({
          failure_reason: reason,
          provider_response: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", withdrawal.id)
        .eq("status", "processing");
      if (persistUnknownError) {
        console.error("[request-driver-payout] ambiguous outcome persist", persistUnknownError);
      }

      return json(req, {
        ok: true,
        pending: true,
        reconciliationRequired: true,
        withdrawalId,
        status: "processing",
      }, 202);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const reason = `HTTP ${response.status}: ${rawText.slice(0, 400)}`;
      const ambiguousHttpFailure = response.status >= 500 || [408, 425, 429].includes(response.status);

      // Woovi's withdraw endpoint has no client-supplied idempotency key. A
      // timeout-like HTTP status or any 5xx can therefore arrive after the
      // provider mutated state. Never refund those cases automatically; keep
      // the ledger reservation intact until MOVEMENT_* webhook/reconciliation.
      if (ambiguousHttpFailure) {
        const { error: persistAmbiguousError } = await admin
          .from("driver_withdrawals")
          .update({
            failure_reason: `provider_http_ambiguous:${reason}`.slice(0, 1000),
            provider_response: providerBody,
            updated_at: new Date().toISOString(),
          })
          .eq("id", withdrawal.id)
          .eq("status", "processing");
        if (persistAmbiguousError) {
          console.error("[request-driver-payout] ambiguous HTTP persist", persistAmbiguousError);
        }

        return json(req, {
          ok: true,
          pending: true,
          reconciliationRequired: true,
          withdrawalId,
          status: "processing",
        }, 202);
      }

      // Explicit, non-ambiguous 4xx rejection means the provider declined the
      // operation before a movement was accepted, so the reserved balance may
      // be returned exactly once by the database reconciliation RPC.
      await admin.rpc("mark_driver_withdrawal_failed", {
        _withdrawal_id: withdrawal.id,
        _reason: reason,
        _response: providerBody as never,
      });
      return json(req, {
        error: "provider_withdrawal_failed",
        withdrawalId,
        detail: reason,
      }, 502);
    }

    const transaction = isObject(providerBody.transaction) ? providerBody.transaction : {};
    const transferId = text(transaction.correlationID) ?? text(transaction.correlationId);
    const endToEndId = text(transaction.endToEndId) ?? text(transaction.end_to_end_id);
    const providerStatus = (text(transaction.status) ?? "created").toLowerCase();
    const providerValue = Number(transaction.value);

    if (Number.isFinite(providerValue) && Math.round(providerValue) !== amountCents) {
      // A successful HTTP response with an unexpected amount is also ambiguous:
      // do not refund automatically because a real movement may already exist.
      const { error: mismatchPersistError } = await admin
        .from("driver_withdrawals")
        .update({
          provider_transfer_id: transferId,
          failure_reason: "provider_amount_mismatch_reconciliation_required",
          provider_response: providerBody,
          updated_at: new Date().toISOString(),
        })
        .eq("id", withdrawal.id)
        .eq("status", "processing");
      if (mismatchPersistError) {
        console.error("[request-driver-payout] amount mismatch persist", mismatchPersistError);
      }
      return json(req, {
        ok: true,
        pending: true,
        reconciliationRequired: true,
        error: "provider_amount_mismatch",
        withdrawalId,
        transferId,
        status: "processing",
      }, 202);
    }

    const { error: metadataError } = await admin
      .from("driver_withdrawals")
      .update({
        provider: "woovi",
        provider_transfer_id: transferId,
        failure_reason: transferId ? null : "provider_correlation_missing_reconciliation_required",
        provider_response: providerBody,
        updated_at: new Date().toISOString(),
      })
      .eq("id", withdrawal.id)
      .eq("status", "processing");
    if (metadataError) {
      console.error("[request-driver-payout] provider metadata", metadataError);
    }

    if (["confirmed", "approved", "paid", "completed"].includes(providerStatus)) {
      const { error: paidError } = await admin.rpc("mark_driver_withdrawal_paid", {
        _withdrawal_id: withdrawal.id,
        _transfer_id: transferId,
        _end_to_end_id: endToEndId,
        _response: providerBody as never,
      });
      if (paidError) return json(req, { error: "withdrawal_finalize_failed" }, 500);
      return json(req, {
        ok: true,
        withdrawalId,
        transferId,
        endToEndId,
        status: "paid",
      });
    }

    return json(req, {
      ok: true,
      pending: true,
      reconciliationRequired: !transferId,
      withdrawalId,
      transferId,
      status: providerStatus,
    }, 202);
  } catch (error) {
    console.error("[request-driver-payout] unexpected", error);
    return json(req, { error: "unexpected" }, 500);
  }
});