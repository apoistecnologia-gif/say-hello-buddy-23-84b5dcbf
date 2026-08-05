import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ADMIN_ROLES = ["admin", "super_admin", "operations", "financial", "support", "readonly"];
const FINANCIAL_ROLES = new Set(["admin", "super_admin", "operations", "financial"]);
const ACTIONS = new Set(["summary", "ride_detail", "rides", "withdrawals"]);
const RIDE_STATUSES = new Set([
  "agendada",
  "procurar_motorista",
  "motorista_a_caminho",
  "motorista_chegou",
  "em_viagem",
  "finalizada",
  "cancelada_passageiro",
  "cancelada_motorista",
  "expired",
]);
const WITHDRAWAL_STATUSES = new Set(["pending", "processing", "paid", "failed", "rejected"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 16_384;
const MAX_OFFSET = 10_000;

type JsonMap = Record<string, unknown>;
type AdminClient = ReturnType<typeof createClient>;

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function object(value: unknown): JsonMap | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonMap
    : null;
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function optionalIso(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function maskPixKey(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const key = value.trim();
  if (key.length <= 6) return "***";
  return `${key.slice(0, 3)}***${key.slice(-3)}`;
}

async function count(admin: AdminClient, table: string, apply?: (query: any) => any) {
  let query = admin.from(table).select("id", { count: "exact", head: true });
  if (apply) query = apply(query);
  const { count, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return json(req, { ok: false, error: "method_not_allowed" }, 405);

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
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
    const { data: userResult, error: userError } = await userClient.auth.getUser();
    const userId = userResult.user?.id;
    if (userError || !userId) return json(req, { ok: false, error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: roles, error: roleError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ADMIN_ROLES)
      .limit(1);
    if (roleError) return json(req, { ok: false, error: "role_check_failed" }, 500);
    const role = typeof roles?.[0]?.role === "string" ? roles[0].role : null;
    if (!role) return json(req, { ok: false, error: "forbidden" }, 403);

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return json(req, { ok: false, error: "invalid_json" }, 400);
    }
    const body = object(rawBody);
    if (!body) return json(req, { ok: false, error: "invalid_payload" }, 422);

    const action = typeof body.action === "string" ? body.action.trim() : "summary";
    if (!ACTIONS.has(action)) return json(req, { ok: false, error: "unknown_action" }, 404);
    if (action === "withdrawals" && !FINANCIAL_ROLES.has(role)) {
      return json(req, { ok: false, error: "forbidden" }, 403);
    }

    if (action === "summary") {
      const activeStatuses = ["procurar_motorista", "motorista_a_caminho", "motorista_chegou", "em_viagem"];
      const onlineCutoff = new Date(Date.now() - 2 * 60_000).toISOString();
      const stuckCutoff = new Date(Date.now() - 15 * 60_000).toISOString();
      const [
        activeRides,
        searching,
        inTrip,
        onlineDrivers,
        staleOnlineDrivers,
        pendingFees,
        blockedWallets,
        pendingPayouts,
        stuckPayouts,
      ] = await Promise.all([
        count(admin, "rides", (q) => q.in("status", activeStatuses)),
        count(admin, "rides", (q) => q.eq("status", "procurar_motorista")),
        count(admin, "rides", (q) => q.eq("status", "em_viagem")),
        count(admin, "drivers", (q) => q.eq("is_online", true).gte("last_location_at", onlineCutoff)),
        count(admin, "drivers", (q) => q.eq("is_online", true).lt("last_location_at", onlineCutoff)),
        count(admin, "cancellation_fees", (q) => q.in("status", ["pending", "unpaid"])),
        count(admin, "passenger_wallets", (q) => q.eq("is_blocked", true)),
        count(admin, "driver_withdrawals", (q) => q.in("status", ["pending", "processing"])),
        count(admin, "driver_withdrawals", (q) => q.eq("status", "processing").lt("processing_started_at", stuckCutoff)),
      ]);

      const { data: latestRides, error: ridesError } = await admin
        .from("rides")
        .select("id,status,origin_name,destination_name,passenger_id,driver_id,estimated_price,final_price,payment_method,created_at,updated_at")
        .order("updated_at", { ascending: false })
        .limit(20);
      if (ridesError) throw new Error(ridesError.message);

      return json(req, {
        ok: true,
        generated_at: new Date().toISOString(),
        metrics: {
          active_rides: activeRides,
          searching_rides: searching,
          rides_in_trip: inTrip,
          online_drivers: onlineDrivers,
          stale_online_drivers: staleOnlineDrivers,
          pending_cancellation_fees: pendingFees,
          blocked_passenger_wallets: blockedWallets,
          pending_driver_payouts: pendingPayouts,
          stuck_driver_payouts: stuckPayouts,
        },
        latest_rides: latestRides ?? [],
      });
    }

    if (action === "ride_detail") {
      const rideId = typeof body.ride_id === "string" ? body.ride_id.trim() : "";
      if (!UUID_RE.test(rideId)) return json(req, { ok: false, error: "invalid_ride_id" }, 422);

      const { data: ride, error: rideError } = await admin
        .from("rides")
        .select("id,status,passenger_id,driver_id,category,origin_name,origin_lat,origin_lng,destination_name,destination_lat,destination_lng,estimated_price,final_price,distance_km,duration_min,payment_method,accepted_at,driver_arrived_at,started_at,completed_at,cancelled_at,cancelled_by,cancellation_reason,created_at,updated_at")
        .eq("id", rideId)
        .maybeSingle();
      if (rideError) throw new Error(rideError.message);
      if (!ride) return json(req, { ok: false, error: "ride_not_found" }, 404);

      const [fees, passengerWallet, driverWallet, transactions] = await Promise.all([
        admin
          .from("cancellation_fees")
          .select("id,ride_id,passenger_id,value,fee_amount,status,is_paid,paid_at,reason,created_at,updated_at")
          .eq("ride_id", rideId)
          .order("created_at", { ascending: false })
          .limit(20),
        admin
          .from("passenger_wallets")
          .select("id,passenger_id,balance,currency,is_blocked,blocked_reason,updated_at")
          .eq("passenger_id", ride.passenger_id)
          .maybeSingle(),
        ride.driver_id
          ? admin
            .from("driver_wallets")
            .select("id,driver_id,balance,available_balance,pending_balance,currency,updated_at")
            .eq("driver_id", ride.driver_id)
            .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        ride.driver_id
          ? admin
            .from("driver_wallet_transactions")
            .select("id,driver_id,amount,status,source,source_ride_id,description,created_at,updated_at")
            .eq("source_ride_id", rideId)
            .order("created_at", { ascending: false })
            .limit(100)
          : Promise.resolve({ data: [], error: null }),
      ]);
      for (const result of [fees, passengerWallet, driverWallet, transactions]) {
        if (result.error) throw new Error(result.error.message);
      }
      return json(req, {
        ok: true,
        ride,
        cancellation_fees: fees.data ?? [],
        passenger_wallet: passengerWallet.data ?? null,
        driver_wallet: driverWallet.data ?? null,
        driver_wallet_transactions: transactions.data ?? [],
      });
    }

    if (action === "rides") {
      const limit = integer(body.limit, 50, 1, 200);
      const offset = integer(body.offset, 0, 0, MAX_OFFSET);
      const status = typeof body.status === "string" ? body.status.trim() : "";
      if (status && !RIDE_STATUSES.has(status)) {
        return json(req, { ok: false, error: "invalid_status" }, 422);
      }
      const from = optionalIso(body.from);
      const to = optionalIso(body.to);
      if (body.from && !from) return json(req, { ok: false, error: "invalid_from" }, 422);
      if (body.to && !to) return json(req, { ok: false, error: "invalid_to" }, 422);
      if (from && to && from > to) return json(req, { ok: false, error: "invalid_date_range" }, 422);

      let query = admin
        .from("rides")
        .select("id,status,origin_name,destination_name,passenger_id,driver_id,estimated_price,final_price,payment_method,created_at,updated_at")
        .order("updated_at", { ascending: false })
        .range(offset, offset + limit);
      if (status) query = query.eq("status", status);
      if (from) query = query.gte("created_at", from);
      if (to) query = query.lte("created_at", to);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      const hasMore = rows.length > limit;
      return json(req, {
        ok: true,
        rides: hasMore ? rows.slice(0, limit) : rows,
        pagination: { limit, offset, has_more: hasMore },
      });
    }

    const limit = integer(body.limit, 50, 1, 200);
    const offset = integer(body.offset, 0, 0, MAX_OFFSET);
    const status = typeof body.status === "string" ? body.status.trim() : "";
    if (status && !WITHDRAWAL_STATUSES.has(status)) {
      return json(req, { ok: false, error: "invalid_status" }, 422);
    }
    const from = optionalIso(body.from);
    const to = optionalIso(body.to);
    if (body.from && !from) return json(req, { ok: false, error: "invalid_from" }, 422);
    if (body.to && !to) return json(req, { ok: false, error: "invalid_to" }, 422);
    if (from && to && from > to) return json(req, { ok: false, error: "invalid_date_range" }, 422);

    let query = admin
      .from("driver_withdrawals")
      .select("id,driver_id,amount,status,pix_key,pix_key_type,pix_holder_name,provider_status,processing_started_at,last_checked_at,attempt_count,rejection_reason,processed_at,created_at,updated_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit);
    if (status) query = query.eq("status", status);
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data ?? []).map((row) => ({
      ...row,
      pix_key: maskPixKey(row.pix_key),
    }));
    const hasMore = rows.length > limit;
    return json(req, {
      ok: true,
      withdrawals: hasMore ? rows.slice(0, limit) : rows,
      pagination: { limit, offset, has_more: hasMore },
    });
  } catch (error) {
    console.error("[admin-operations-read] fatal", error);
    return json(req, { ok: false, error: "internal_error" }, 500);
  }
});
