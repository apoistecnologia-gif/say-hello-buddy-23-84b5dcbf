import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const WOOVI_APP_ID = (Deno.env.get("WOOVI_APP_ID") ?? "").trim();
const WOOVI_API_BASE_URL = (Deno.env.get("WOOVI_API_BASE_URL")?.trim() || "https://api.woovi.com").replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 15_000;

const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...getCorsHeaders(req), "content-type": "application/json" },
});

type WithdrawalReservation = {
  withdrawalId?: string;
  status?: string;
  provider?: string;
  amountCents?: number;
  feeCents?: number;
  netAmountCents?: number;
  idempotent?: boolean;
};

type Withdrawal = {
  id: string;
  driver_id: string;
  amount: number;
  provider_fee_amount: number;
  net_amount: number;
  pix_key: string;
  status: string;
  provider: string | null;
  provider_transfer_id: string | null;
};

type JsonObject = Record<string, unknown>;
type FinanceSettingRow = { key: string; value: unknown };
type AdminClient = SupabaseClient<any, "public", any>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeAmountCents(amountCentsValue: unknown, legacyAmountValue: unknown): number | null {
  if (amountCentsValue !== undefined && amountCentsValue !== null) {
    const cents = Number(amountCentsValue);
    if (!Number.isSafeInteger(cents) || cents < 2_000 || cents > 5_000_000) return null;
    return cents;
  }
  const legacyAmount = Number(legacyAmountValue);
  if (!Number.isFinite(legacyAmount)) return null;
  const cents = Math.round(legacyAmount * 100);
  return cents >= 2_000 && cents <= 5_000_000 ? cents : null;
}

function validUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized) ? normalized : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function settingScalar(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return "";
  try { return JSON.parse(trimmed); } catch { return trimmed; }
}

async function loadPayoutGate(admin: AdminClient): Promise<{ enabled: boolean; provider: string }> {
  const { data, error } = await admin
    .from("app_settings")
    .select("key,value")
    .in("key", ["finance.driver_payouts_enabled", "finance.target_payout_provider"]);
  if (error) throw new Error(`payout_settings_lookup_failed:${error.message}`);
  const settings = new Map((data as FinanceSettingRow[] | null ?? []).map((row) => [row.key, settingScalar(row.value)]));
  const enabledValue = settings.get("finance.driver_payouts_enabled");
  const enabled = enabledValue === true || String(enabledValue ?? "").toLowerCase() === "true";
  const provider = String(settings.get("finance.target_payout_provider") ?? "disabled").trim().toLowerCase() || "disabled";
  return { enabled, provider };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json(req, { error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userResult, error: userError } = await userClient.auth.getUser();
    if (userError || !userResult.user) return json(req, { error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
    const payoutGate = await loadPayoutGate(admin);
    if (!payoutGate.enabled) {
      return json(req, { error: "driver_payouts_disabled", provider: payoutGate.provider }, 503);
    }
    if (payoutGate.provider === "pagbank") {
      return json(req, { error: "pagbank_payout_not_homologated", provider: "pagbank" }, 503);
    }
    if (payoutGate.provider !== "woovi") {
      return json(req, { error: "payout_provider_adapter_unavailable", provider: payoutGate.provider }, 503);
    }
    if (!WOOVI_APP_ID) return json(req, { error: "payment_provider_not_configured", provider: "woovi" }, 503);

    let payload: { amountCents?: unknown; amount?: unknown; idempotencyKey?: unknown } = {};
    try { payload = await req.json(); } catch { return json(req, { error: "invalid_json" }, 400); }

    const amountCents = normalizeAmountCents(payload.amountCents, payload.amount);
    if (amountCents === null) {
      return json(req, { error: "invalid_withdrawal_amount", detail: "Informe um valor entre R$ 20,00 e R$ 50.000,00." }, 422);
    }

    const idempotencyKey = validUuid(payload.idempotencyKey);
    if (!idempotencyKey) {
      return json(req, { error: "idempotency_key_required", detail: "A solicitação de saque precisa de uma chave UUID estável para impedir duplicidade." }, 422);
    }

    const { data: reservationData, error: reservationError } = await userClient.rpc("driver_request_withdrawal", {
      _amount_cents: amountCents,
      _idempotency_key: idempotencyKey,
    });
    if (reservationError) return json(req, { error: "withdrawal_request_failed", detail: reservationError.message }, 422);

    const reservation = (isObject(reservationData) ? reservationData : {}) as WithdrawalReservation;
    const withdrawalId = text(reservation.withdrawalId);
    if (!withdrawalId) return json(req, { error: "withdrawal_reservation_invalid" }, 500);

    if (reservation.idempotent && reservation.status === "paid") {
      return json(req, {
        ok: true,
        idempotent: true,
        withdrawalId,
        amountCents: reservation.amountCents,
        feeCents: reservation.feeCents,
        netAmountCents: reservation.netAmountCents,
        status: "paid",
      });
    }

    const { data: withdrawalRow, error: withdrawalError } = await admin
      .from("driver_withdrawals")
      .select("id,driver_id,amount,provider_fee_amount,net_amount,pix_key,status,provider,provider_transfer_id")
      .eq("id", withdrawalId)
      .maybeSingle();
    if (withdrawalError || !withdrawalRow) return json(req, { error: "withdrawal_not_found" }, 500);
    const withdrawal = withdrawalRow as Withdrawal;

    const grossAmountCents = Math.round(Number(withdrawal.amount) * 100);
    const feeCents = Math.round(Number(withdrawal.provider_fee_amount) * 100);
    const providerAmountCents = Math.round(Number(withdrawal.net_amount) * 100);
    if (!Number.isSafeInteger(providerAmountCents) || providerAmountCents <= 0 || grossAmountCents !== providerAmountCents + feeCents) {
      return json(req, { error: "withdrawal_amount_breakdown_invalid", withdrawalId }, 500);
    }

    if (withdrawal.provider !== "woovi" || !withdrawal.pix_key) {
      await admin.rpc("mark_driver_withdrawal_failed", {
        _withdrawal_id: withdrawal.id,
        _reason: "woovi_payment_account_missing",
        _response: null,
      });
      return json(req, { error: "woovi_payment_account_missing", withdrawalId }, 409);
    }

    if (withdrawal.status === "processing") {
      return json(req, {
        ok: true,
        pending: true,
        idempotent: true,
        reconciliationRequired: !withdrawal.provider_transfer_id,
        withdrawalId,
        transferId: withdrawal.provider_transfer_id,
        amountCents: grossAmountCents,
        feeCents,
        netAmountCents: providerAmountCents,
        status: "processing",
      }, 202);
    }

    const { error: processingError } = await admin.rpc("mark_driver_withdrawal_processing", { _withdrawal_id: withdrawal.id });
    if (processingError) return json(req, { error: "withdrawal_claim_failed", detail: processingError.message }, 409);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    let rawText = "";
    let providerBody: JsonObject = {};
    try {
      response = await fetch(`${WOOVI_API_BASE_URL}/api/v1/subaccount/${encodeURIComponent(withdrawal.pix_key)}/withdraw`, {
        method: "POST",
        headers: { Authorization: WOOVI_APP_ID, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ value: providerAmountCents }),
        signal: controller.signal,
      });
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
      await admin.from("driver_withdrawals").update({ failure_reason: reason, provider_response: null, updated_at: new Date().toISOString() })
        .eq("id", withdrawal.id).eq("status", "processing");
      return json(req, {
        ok: true,
        pending: true,
        reconciliationRequired: true,
        withdrawalId,
        amountCents: grossAmountCents,
        feeCents,
        netAmountCents: providerAmountCents,
        status: "processing",
      }, 202);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const reason = `HTTP ${response.status}: ${rawText.slice(0, 400)}`;
      const ambiguousHttpFailure = response.status >= 500 || [408, 425, 429].includes(response.status);
      if (ambiguousHttpFailure) {
        await admin.from("driver_withdrawals").update({
          failure_reason: `provider_http_ambiguous:${reason}`.slice(0, 1000),
          provider_response: providerBody,
          updated_at: new Date().toISOString(),
        }).eq("id", withdrawal.id).eq("status", "processing");
        return json(req, {
          ok: true,
          pending: true,
          reconciliationRequired: true,
          withdrawalId,
          amountCents: grossAmountCents,
          feeCents,
          netAmountCents: providerAmountCents,
          status: "processing",
        }, 202);
      }

      await admin.rpc("mark_driver_withdrawal_failed", {
        _withdrawal_id: withdrawal.id,
        _reason: reason,
        _response: providerBody as never,
      });
      return json(req, { error: "provider_withdrawal_failed", withdrawalId, detail: reason }, 502);
    }

    const transaction = isObject(providerBody.transaction) ? providerBody.transaction : {};
    const transferId = text(transaction.correlationID) ?? text(transaction.correlationId);
    const endToEndId = text(transaction.endToEndId) ?? text(transaction.end_to_end_id);
    const providerStatus = (text(transaction.status) ?? "created").toLowerCase();
    const providerValue = Number(transaction.value);

    if (Number.isFinite(providerValue) && Math.round(providerValue) !== providerAmountCents) {
      await admin.from("driver_withdrawals").update({
        provider_transfer_id: transferId,
        failure_reason: "provider_amount_mismatch_reconciliation_required",
        provider_response: providerBody,
        updated_at: new Date().toISOString(),
      }).eq("id", withdrawal.id).eq("status", "processing");
      return json(req, {
        ok: true,
        pending: true,
        reconciliationRequired: true,
        error: "provider_amount_mismatch",
        withdrawalId,
        transferId,
        amountCents: grossAmountCents,
        feeCents,
        netAmountCents: providerAmountCents,
        status: "processing",
      }, 202);
    }

    await admin.from("driver_withdrawals").update({
      provider: "woovi",
      provider_transfer_id: transferId,
      failure_reason: transferId ? null : "provider_correlation_missing_reconciliation_required",
      provider_response: providerBody,
      updated_at: new Date().toISOString(),
    }).eq("id", withdrawal.id).eq("status", "processing");

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
        amountCents: grossAmountCents,
        feeCents,
        netAmountCents: providerAmountCents,
        status: "paid",
      });
    }

    return json(req, {
      ok: true,
      pending: true,
      reconciliationRequired: !transferId,
      withdrawalId,
      transferId,
      amountCents: grossAmountCents,
      feeCents,
      netAmountCents: providerAmountCents,
      status: providerStatus,
    }, 202);
  } catch (error) {
    console.error("[request-driver-payout] unexpected", error);
    return json(req, { error: "unexpected" }, 500);
  }
});