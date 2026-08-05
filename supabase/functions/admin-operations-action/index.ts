import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ROLES = ["super_admin", "admin", "financial", "operations"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonMap = Record<string, unknown>;

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "content-type": "application/json" },
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

function text(value: unknown, name: string, max = 500) {
  if (typeof value !== "string") fail(`invalid_${name}`);
  const out = value.trim();
  if (!out || out.length > max) fail(`invalid_${name}`);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return json(req, { ok: false, error: "method_not_allowed" }, 405);

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
      .in("role", ALLOWED_ROLES)
      .limit(1);
    if (roleError) return json(req, { ok: false, error: "role_check_failed" }, 500);
    if (!roles?.length) return json(req, { ok: false, error: "forbidden" }, 403);

    let body: { action?: unknown; payload?: unknown };
    try {
      body = await req.json();
    } catch {
      return json(req, { ok: false, error: "invalid_json" }, 400);
    }

    const action = text(body.action, "action", 80);
    const payload = object(body.payload ?? {});
    let targetType = "unknown";
    let targetId: string | null = null;
    let before: unknown = null;
    let after: unknown = null;

    if (action === "cancellation_fee.waive") {
      const feeId = uuid(payload.id, "id");
      const reason = text(payload.reason, "reason", 500);
      const { data: fee, error } = await admin.from("cancellation_fees").select("*").eq("id", feeId).maybeSingle();
      if (error) fail(error.message, 422);
      if (!fee) fail("fee_not_found", 404);
      if (fee.is_paid || fee.status === "paid") fail("fee_already_paid", 409);

      const patch = {
        status: "waived",
        reason: `${fee.reason ? `${fee.reason} | ` : ""}Dispensada: ${reason}`,
        updated_at: new Date().toISOString(),
      };
      const updated = await admin.from("cancellation_fees").update(patch).eq("id", feeId);
      if (updated.error) fail(updated.error.message, 422);

      const pending = await admin.from("cancellation_fees").select("id", { count: "exact", head: true })
        .eq("passenger_id", fee.passenger_id).eq("is_paid", false).eq("status", "pending");
      if (pending.error) fail(pending.error.message, 422);
      if ((pending.count ?? 0) === 0) {
        const wallet = await admin.from("passenger_wallets")
          .update({ is_blocked: false, blocked_reason: null, updated_at: new Date().toISOString() })
          .eq("passenger_id", fee.passenger_id);
        if (wallet.error) fail(wallet.error.message, 422);
      }

      targetType = "cancellation_fee";
      targetId = feeId;
      before = fee;
      after = patch;
    } else if (action === "passenger_wallet.set_blocked") {
      const passengerId = uuid(payload.passenger_id, "passenger_id");
      if (typeof payload.blocked !== "boolean") fail("invalid_blocked");
      const reason = payload.blocked ? text(payload.reason, "reason", 500) : null;
      const { data: wallet, error } = await admin.from("passenger_wallets").select("*")
        .eq("passenger_id", passengerId).maybeSingle();
      if (error) fail(error.message, 422);
      if (!wallet) fail("wallet_not_found", 404);

      if (!payload.blocked) {
        const pending = await admin.from("cancellation_fees").select("id", { count: "exact", head: true })
          .eq("passenger_id", passengerId).eq("is_paid", false).eq("status", "pending");
        if (pending.error) fail(pending.error.message, 422);
        if ((pending.count ?? 0) > 0) fail("pending_fees_prevent_unblock", 409);
      }

      const patch = { is_blocked: payload.blocked, blocked_reason: reason, updated_at: new Date().toISOString() };
      const updated = await admin.from("passenger_wallets").update(patch).eq("passenger_id", passengerId);
      if (updated.error) fail(updated.error.message, 422);

      targetType = "passenger_wallet";
      targetId = wallet.id;
      before = wallet;
      after = patch;
    } else if (action === "withdrawal.reject") {
      const withdrawalId = uuid(payload.id, "id");
      const reason = text(payload.reason, "reason", 500);
      const { data: withdrawal, error } = await admin.from("driver_withdrawals").select("*")
        .eq("id", withdrawalId).maybeSingle();
      if (error) fail(error.message, 422);
      if (!withdrawal) fail("withdrawal_not_found", 404);
      if (!["pending", "processing"].includes(withdrawal.status)) fail("withdrawal_not_rejectable", 409);

      const failed = await admin.rpc("mark_driver_withdrawal_failed", {
        _withdrawal_id: withdrawalId,
        _reason: `Rejeitado pelo painel: ${reason}`,
        _response: { source: "admin-operations-action", actor_id: actorId },
      });
      if (failed.error) fail(failed.error.message, 422);

      targetType = "driver_withdrawal";
      targetId = withdrawalId;
      before = withdrawal;
      after = { status: "failed", rejection_reason: reason, balance_refunded: true };
    } else {
      fail("unknown_action", 404);
    }

    const audit = await admin.from("admin_audit_logs").insert({
      actor_id: actorId,
      action,
      target_type: targetType,
      target_id: targetId,
      before,
      after,
      metadata: { source: "admin-operations-action" },
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
