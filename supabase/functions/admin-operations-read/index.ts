import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ADMIN_ROLES = ["admin", "super_admin", "operations", "financial", "support", "readonly"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "content-type": "application/json" },
  });
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

async function count(admin: ReturnType<typeof createClient>, table: string, apply?: (query: any) => any) {
  let query = admin.from(table).select("id", { count: "exact", head: true });
  if (apply) query = apply(query);
  const { count, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
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
    if (!roles?.length) return json(req, { ok: false, error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "summary");

    if (action === "summary") {
      const activeStatuses = ["procurar_motorista", "motorista_a_caminho", "motorista_chegou", "em_viagem"];
      const [activeRides, searching, inTrip, onlineDrivers, pendingFees, blockedWallets, pendingPayouts] = await Promise.all([
        count(admin, "rides", (q) => q.in("status", activeStatuses)),
        count(admin, "rides", (q) => q.eq("status", "procurar_motorista")),
        count(admin, "rides", (q) => q.eq("status", "em_viagem")),
        count(admin, "drivers", (q) => q.eq("is_online", true)),
        count(admin, "cancellation_fees", (q) => q.in("status", ["pending", "unpaid"])),
        count(admin, "passenger_wallets", (q) => q.eq("is_blocked", true)),
        count(admin, "driver_payout_requests", (q) => q.in("status", ["pending", "processing"])),
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
          pending_cancellation_fees: pendingFees,
          blocked_passenger_wallets: blockedWallets,
          pending_driver_payouts: pendingPayouts,
        },
        latest_rides: latestRides ?? [],
      });
    }

    if (action === "ride_detail") {
      const rideId = String(body?.ride_id ?? "");
      if (!UUID_RE.test(rideId)) return json(req, { ok: false, error: "invalid_ride_id" }, 422);
      const { data: ride, error: rideError } = await admin.from("rides").select("*").eq("id", rideId).maybeSingle();
      if (rideError) throw new Error(rideError.message);
      if (!ride) return json(req, { ok: false, error: "ride_not_found" }, 404);

      const [fee, passengerWallet, driverWallet, transactions] = await Promise.all([
        admin.from("cancellation_fees").select("*").eq("ride_id", rideId).maybeSingle(),
        admin.from("passenger_wallets").select("*").eq("passenger_id", ride.passenger_id).maybeSingle(),
        ride.driver_id
          ? admin.from("driver_wallets").select("*").eq("driver_id", ride.driver_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        ride.driver_id
          ? admin.from("driver_wallet_transactions").select("*").eq("ride_id", rideId).order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);
      for (const result of [fee, passengerWallet, driverWallet, transactions]) {
        if (result.error) throw new Error(result.error.message);
      }
      return json(req, {
        ok: true,
        ride,
        cancellation_fee: fee.data ?? null,
        passenger_wallet: passengerWallet.data ?? null,
        driver_wallet: driverWallet.data ?? null,
        driver_wallet_transactions: transactions.data ?? [],
      });
    }

    if (action === "rides") {
      const limit = integer(body?.limit, 50, 1, 200);
      const status = typeof body?.status === "string" ? body.status.trim() : "";
      let query = admin
        .from("rides")
        .select("id,status,origin_name,destination_name,passenger_id,driver_id,estimated_price,final_price,payment_method,cancellation_fee,created_at,updated_at")
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (status) query = query.eq("status", status);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return json(req, { ok: true, rides: data ?? [] });
    }

    return json(req, { ok: false, error: "unknown_action" }, 404);
  } catch (error) {
    console.error("[admin-operations-read] fatal", error);
    return json(req, {
      ok: false,
      error: "internal_error",
      detail: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
