import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ROLES = ["super_admin", "admin", "financial", "operations"];
const FINANCIAL_ROLES = new Set(["super_admin", "admin", "financial"]);
const ACTIONS = new Set([
  "cancellation_fee.waive",
  "passenger_wallet.set_blocked",
  "withdrawal.reject",
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 16_384;

type JsonMap = Record<string, unknown>;

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function object(value: unknown): JsonMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid_payload");
  return value as JsonMap;
}

function uuid(value: unknown, name: string) {
  if (typeof value !== "string" || !UUID_RE.test(value)) fail(`invalid_${name}`);
  return value;
}

function text(value: unknown, name: string, max = 500, min = 1) {
  if (typeof value !== "string") fail(`invalid_${name}`);
  const out = value.trim();
  if (out.length < min || out.length > max) fail(`invalid_${name}`);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return json(req, { ok: false, error: "method_not_allowed" }, 405);

  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    return json(req, { ok: false, error: "unsupported_media_type" }, 415);
  }
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json(req, { ok: false, error: "payload_too_large" }, 413);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(req, { ok: false, error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    const actorId = authData.user?.id;
    if (authError || !actorId) return json(req, { ok: false, error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: roles, error: roleError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", actorId)
      .in("role", ALLOWED_ROLES);
    if (roleError) return json(req, { ok: false, error: "role_check_failed" }, 500);
    const roleSet = new Set((roles ?? []).map((row) => String(row.role)));
    if (roleSet.size === 0) return json(req, { ok: false, error: "forbidden" }, 403);

    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return json(req, { ok: false, error: "payload_too_large" }, 413);
    }

    let body: { action?: unknown; payload?: unknown };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json(req, { ok: false, error: "invalid_json" }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json(req, { ok: false, error: "invalid_json_object" }, 400);
    }

    const action = text(body.action, "action", 80);
    if (!ACTIONS.has(action)) fail("unknown_action", 404);
    if (action === "withdrawal.reject" && ![...roleSet].some((role) => FINANCIAL_ROLES.has(role))) {
      fail("forbidden_financial_action", 403);
    }

    const payload = object(body.payload ?? {});
    let targetType = "unknown";
    let targetId: string | null = null;
    let before: unknown = null;
    let after: unknown = null;

    if (action === "cancellation_fee.waive") {
      const feeId = uuid(payload.id, "id");
      const reason = text(payload.reason, "reason", 500, 3);
      const { data: fee, error } = await admin
        .from("cancellation_fees")
        .select("id,passenger_id,ride_id,status,is_paid,reason,fee_amount,created_at")
        .eq("id", feeId)
        .maybeSingle();
      if (error) fail("fee_lookup_failed", 500);
      if (!fee) fail("fee_not_found", 404);
      if (fee.is_paid || fee.status === "paid") fail("fee_already_paid", 409);
      if (fee.status === "waived") fail("fee_already_waived", 409);

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
        .neq("status", "paid")
        .neq("status", "waived")
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
        const wallet = await admin
          .from("passenger_wallets")
          .update({ is_blocked: false, blocked_reason: null, updated_at: new Date().toISOString() })
          .eq("passenger_id", fee.passenger_id)
          .select("id")
          .maybeSingle();
        if (wallet.error) fail("wallet_unblock_failed", 500);
      }

      targetType = "cancellation_fee";
      targetId = feeId;
      before = fee;
      after = patch;
    } else if (action === "passenger_wallet.set_blocked") {
      const passengerId = uuid(payload.passenger_id, "passenger_id");
      if (typeof payload.blocked !== "boolean") fail("invalid_blocked");
      const reason = payload.blocked ? text(payload.reason, "reason", 500, 3) : null;
      const { data: wallet, error } = await admin
        .from("passenger_wallets")
        .select("id,passenger_id,is_blocked,blocked_reason,balance,currency,updated_at")
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
        .eq("updated_at", wallet.updated_at)
        .select("id")
        .maybeSingle();
      if (updateError) fail("wallet_update_failed", 500);
      if (!updatedWallet) fail("wallet_changed_concurrently", 409);

      targetType = "passenger_wallet";
      targetId = wallet.id;
      before = wallet;
      after = patch;
    } else if (action === "withdrawal.reject") {
      const withdrawalId = uuid(payload.id, "id");
      const reason = text(payload.reason, "reason", 500, 3);
      const { data: withdrawal, error } = await admin
        .from("driver_withdrawals")
        .select("id,driver_id,amount,status,rejection_reason,created_at,processed_at")
        .eq("id", withdrawalId)
        .maybeSingle();
      if (error) fail("withdrawal_lookup_failed", 500);
      if (!withdrawal) fail("withdrawal_not_found", 404);
      if (!["pending", "processing"].includes(withdrawal.status)) fail("withdrawal_not_rejectable", 409);

      const failed = await admin.rpc("mark_driver_withdrawal_failed", {
        _withdrawal_id: withdrawalId,
        _reason: `Rejeitado pelo painel: ${reason}`,
        _response: { source: "admin-operations-action", actor_id: actorId },
      });
      if (failed.error) fail("withdrawal_rejection_failed", 500);

      targetType = "driver_withdrawal";
      targetId = withdrawalId;
      before = withdrawal;
      after = { status: "failed", rejection_reason: reason, balance_refunded: true };
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
        request_id: crypto.randomUUID(),
      },
    });
    if (audit.error) fail("audit_log_failed", 500);

    return json(req, { ok: true, action, target_id: targetId });
  } catch (error) {
    const rawStatus = typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
    const status = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500;
    const message = status < 500 && error instanceof Error ? error.message : "internal_error";
    if (status >= 500) console.error("[admin-operations-action] fatal", error);
    return json(req, { ok: false, error: message }, status);
  }
});
