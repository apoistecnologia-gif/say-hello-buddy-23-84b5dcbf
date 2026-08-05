import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")?.trim() ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
const ALLOWED_ROLES = ["super_admin", "admin", "financial", "operations"];
const FINANCIAL_ROLES = new Set(["super_admin", "admin", "financial"]);
const ACTIONS = new Set([
  "cancellation_fee.waive",
  "passenger_wallet.set_blocked",
  "withdrawal.reject",
]);
const TOP_LEVEL_KEYS = new Set(["action", "payload"]);
const PAYLOAD_KEYS: Record<string, Set<string>> = {
  "cancellation_fee.waive": new Set(["id", "reason"]),
  "passenger_wallet.set_blocked": new Set(["passenger_id", "blocked", "reason"]),
  "withdrawal.reject": new Set(["id", "reason"]),
};
const WAIVABLE_FEE_STATUSES = new Set(["pending", "unpaid"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_CHAR_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const MAX_BODY_BYTES = 16_384;
const MAX_REASON_LENGTH = 500;
const encoder = new TextEncoder();

type JsonMap = Record<string, unknown>;

function responseHeaders(req: Request, requestId: string) {
  return {
    ...getCorsHeaders(req),
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    pragma: "no-cache",
    expires: "0",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "x-request-id": requestId,
  };
}

function json(req: Request, requestId: string, body: unknown, status = 200, extra?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...responseHeaders(req, requestId), ...(extra ?? {}) },
  });
}

function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function object(value: unknown, name = "payload"): JsonMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`invalid_${name}`);
  return value as JsonMap;
}

function rejectUnknownKeys(value: JsonMap, allowed: Set<string>, name: string) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) fail(`unknown_${name}_field`, 422);
}

function uuid(value: unknown, name: string) {
  if (typeof value !== "string") fail(`invalid_${name}`);
  const normalized = value.trim().toLowerCase();
  if (!UUID_RE.test(normalized)) fail(`invalid_${name}`);
  return normalized;
}

function text(value: unknown, name: string, max = MAX_REASON_LENGTH, min = 1) {
  if (typeof value !== "string") fail(`invalid_${name}`);
  const out = value.replace(/\s+/g, " ").trim();
  if (out.length < min || out.length > max || CONTROL_CHAR_RE.test(out)) fail(`invalid_${name}`);
  return out;
}

Deno.serve(async (req) => {
  const incomingRequestId = req.headers.get("x-request-id")?.trim() ?? "";
  const requestId = UUID_RE.test(incomingRequestId) ? incomingRequestId.toLowerCase() : crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeaders(req, requestId) });
  }
  if (req.method !== "POST") {
    return json(req, requestId, { ok: false, error: "method_not_allowed", request_id: requestId }, 405, {
      allow: "POST, OPTIONS",
    });
  }

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE) {
    console.error("[admin-operations-action] missing required environment configuration");
    return json(req, requestId, { ok: false, error: "service_unavailable", request_id: requestId }, 503);
  }

  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    return json(req, requestId, { ok: false, error: "unsupported_media_type", request_id: requestId }, 415);
  }

  const rawContentLength = req.headers.get("content-length");
  if (rawContentLength !== null) {
    const contentLength = Number(rawContentLength);
    if (!Number.isInteger(contentLength) || contentLength < 0) {
      return json(req, requestId, { ok: false, error: "invalid_content_length", request_id: requestId }, 400);
    }
    if (contentLength > MAX_BODY_BYTES) {
      return json(req, requestId, { ok: false, error: "payload_too_large", request_id: requestId }, 413);
    }
  }

  try {
    const authHeader = req.headers.get("authorization")?.trim() ?? "";
    const bearerMatch = authHeader.match(/^Bearer\s+([^\s]+)$/i);
    if (!bearerMatch || bearerMatch[1].length < 20) {
      return json(req, requestId, { ok: false, error: "unauthorized", request_id: requestId }, 401);
    }
    const normalizedAuth = `Bearer ${bearerMatch[1]}`;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: normalizedAuth } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    const actorId = authData.user?.id;
    if (authError || !actorId || !UUID_RE.test(actorId)) {
      return json(req, requestId, { ok: false, error: "unauthorized", request_id: requestId }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: roles, error: roleError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", actorId)
      .in("role", ALLOWED_ROLES)
      .limit(ALLOWED_ROLES.length);
    if (roleError) fail("role_check_failed", 500);
    const roleSet = new Set((roles ?? []).map((row) => String(row.role)));
    if (roleSet.size === 0) fail("forbidden", 403);

    const rawBody = await req.text();
    const actualBodyBytes = encoder.encode(rawBody).byteLength;
    if (actualBodyBytes === 0) fail("empty_body", 400);
    if (actualBodyBytes > MAX_BODY_BYTES) fail("payload_too_large", 413);

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      fail("invalid_json", 400);
    }
    const body = object(parsed, "json_object") as { action?: unknown; payload?: unknown } & JsonMap;
    rejectUnknownKeys(body, TOP_LEVEL_KEYS, "top_level");

    const action = text(body.action, "action", 80);
    if (!ACTIONS.has(action)) fail("unknown_action", 404);
    if (action === "withdrawal.reject" && ![...roleSet].some((role) => FINANCIAL_ROLES.has(role))) {
      fail("forbidden_financial_action", 403);
    }

    const payload = object(body.payload ?? {});
    rejectUnknownKeys(payload, PAYLOAD_KEYS[action], "payload");

    let targetType = "unknown";
    let targetId: string | null = null;
    let before: unknown = null;
    let after: unknown = null;

    if (action === "cancellation_fee.waive") {
      const feeId = uuid(payload.id, "id");
      const reason = text(payload.reason, "reason", MAX_REASON_LENGTH, 3);
      const { data: fee, error } = await admin
        .from("cancellation_fees")
        .select("id,passenger_id,ride_id,status,is_paid,reason,fee_amount,created_at,updated_at")
        .eq("id", feeId)
        .maybeSingle();
      if (error) fail("fee_lookup_failed", 500);
      if (!fee) fail("fee_not_found", 404);
      if (fee.is_paid || fee.status === "paid") fail("fee_already_paid", 409);
      if (fee.status === "waived") fail("fee_already_waived", 409);
      if (!WAIVABLE_FEE_STATUSES.has(String(fee.status))) fail("fee_not_waivable", 409);

      const patch = {
        status: "waived",
        reason: `${fee.reason ? `${fee.reason} | ` : ""}Dispensada: ${reason}`,
        updated_at: new Date().toISOString(),
      };
      const { data: updatedFee, error: updateError } = await admin
        .from("cancellation_fees")
        .update(patch)
        .eq("id", feeId)
        .eq("is_paid", false)
        .in("status", [...WAIVABLE_FEE_STATUSES])
        .eq("updated_at", fee.updated_at)
        .select("id")
        .maybeSingle();
      if (updateError) fail("fee_update_failed", 500);
      if (!updatedFee) fail("fee_changed_concurrently", 409);

      const pending = await admin
        .from("cancellation_fees")
        .select("id", { count: "exact", head: true })
        .eq("passenger_id", fee.passenger_id)
        .eq("is_paid", false)
        .in("status", ["pending", "unpaid"]);
      if (pending.error) fail("pending_fee_check_failed", 500);
      if ((pending.count ?? 0) === 0) {
        const { error: walletError } = await admin
          .from("passenger_wallets")
          .update({ is_blocked: false, blocked_reason: null, updated_at: new Date().toISOString() })
          .eq("passenger_id", fee.passenger_id)
          .eq("is_blocked", true);
        if (walletError) fail("wallet_unblock_failed", 500);
      }

      targetType = "cancellation_fee";
      targetId = feeId;
      before = { id: fee.id, status: fee.status, is_paid: fee.is_paid, reason: fee.reason };
      after = { status: patch.status, reason: patch.reason };
    } else if (action === "passenger_wallet.set_blocked") {
      const passengerId = uuid(payload.passenger_id, "passenger_id");
      if (typeof payload.blocked !== "boolean") fail("invalid_blocked");
      const reason = payload.blocked ? text(payload.reason, "reason", MAX_REASON_LENGTH, 3) : null;
      if (!payload.blocked && payload.reason !== undefined && payload.reason !== null && payload.reason !== "") {
        fail("reason_not_allowed_when_unblocking", 422);
      }

      const { data: wallet, error } = await admin
        .from("passenger_wallets")
        .select("id,passenger_id,is_blocked,blocked_reason,updated_at")
        .eq("passenger_id", passengerId)
        .maybeSingle();
      if (error) fail("wallet_lookup_failed", 500);
      if (!wallet) fail("wallet_not_found", 404);
      if (wallet.is_blocked === payload.blocked && wallet.blocked_reason === reason) {
        fail("wallet_state_unchanged", 409);
      }

      if (!payload.blocked) {
        const pending = await admin
          .from("cancellation_fees")
          .select("id", { count: "exact", head: true })
          .eq("passenger_id", passengerId)
          .eq("is_paid", false)
          .in("status", ["pending", "unpaid"]);
        if (pending.error) fail("pending_fee_check_failed", 500);
        if ((pending.count ?? 0) > 0) fail("pending_fees_prevent_unblock", 409);
      }

      const patch = {
        is_blocked: payload.blocked,
        blocked_reason: reason,
        updated_at: new Date().toISOString(),
      };
      const { data: updatedWallet, error: updateError } = await admin
        .from("passenger_wallets")
        .update(patch)
        .eq("passenger_id", passengerId)
        .eq("is_blocked", wallet.is_blocked)
        .eq("updated_at", wallet.updated_at)
        .select("id")
        .maybeSingle();
      if (updateError) fail("wallet_update_failed", 500);
      if (!updatedWallet) fail("wallet_changed_concurrently", 409);

      targetType = "passenger_wallet";
      targetId = wallet.id;
      before = { id: wallet.id, is_blocked: wallet.is_blocked, blocked_reason: wallet.blocked_reason };
      after = { is_blocked: patch.is_blocked, blocked_reason: patch.blocked_reason };
    } else if (action === "withdrawal.reject") {
      const withdrawalId = uuid(payload.id, "id");
      const reason = text(payload.reason, "reason", MAX_REASON_LENGTH, 3);
      const { data: withdrawal, error } = await admin
        .from("driver_withdrawals")
        .select("id,driver_id,amount,status,rejection_reason,created_at,processed_at,updated_at")
        .eq("id", withdrawalId)
        .maybeSingle();
      if (error) fail("withdrawal_lookup_failed", 500);
      if (!withdrawal) fail("withdrawal_not_found", 404);
      if (!["pending", "processing"].includes(String(withdrawal.status))) fail("withdrawal_not_rejectable", 409);

      const failed = await admin.rpc("mark_driver_withdrawal_failed", {
        _withdrawal_id: withdrawalId,
        _reason: `Rejeitado pelo painel: ${reason}`,
        _response: { source: "admin-operations-action", actor_id: actorId, request_id: requestId },
      });
      if (failed.error) fail("withdrawal_rejection_failed", 500);

      const { data: confirmed, error: confirmError } = await admin
        .from("driver_withdrawals")
        .select("id,status,rejection_reason,processed_at")
        .eq("id", withdrawalId)
        .maybeSingle();
      if (confirmError) fail("withdrawal_confirmation_failed", 500);
      if (!confirmed || !["failed", "rejected"].includes(String(confirmed.status))) {
        fail("withdrawal_rejection_not_confirmed", 500);
      }

      targetType = "driver_withdrawal";
      targetId = withdrawalId;
      before = { id: withdrawal.id, status: withdrawal.status, amount: withdrawal.amount };
      after = {
        status: confirmed.status,
        rejection_reason: confirmed.rejection_reason ?? reason,
        processed_at: confirmed.processed_at,
        balance_refunded: true,
      };
    }

    const audit = await admin.from("admin_audit_logs").insert({
      actor_id: actorId,
      action,
      target_type: targetType,
      target_id: targetId,
      before,
      after,
      metadata: {
        source: "admin-operations-action",
        request_id: requestId,
        roles: [...roleSet].sort(),
      },
    });
    if (audit.error) {
      console.error("[admin-operations-action] audit_log_failed", { requestId, action, targetId });
      fail("audit_log_failed", 500);
    }

    return json(req, requestId, { ok: true, action, target_id: targetId, request_id: requestId });
  } catch (error) {
    const rawStatus = typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
    const status = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500;
    const message = status < 500 && error instanceof Error ? error.message : "internal_error";
    if (status >= 500) console.error("[admin-operations-action] fatal", { requestId, error });
    return json(req, requestId, { ok: false, error: message, request_id: requestId }, status);
  }
});
