import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...(req ? getCorsHeaders(req) : {}), "content-type": "application/json" },
  });
}

function statusForError(errorCode: string): number {
  switch (errorCode) {
    case "unauthorized":
      return 401;
    case "passenger_profile_missing":
    case "ride_not_found":
      return 404;
    case "invalid_ride_id":
      return 422;
    case "cancellation_not_allowed":
    case "invalid_ride_status":
      return 409;
    default:
      return 500;
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
    if (req.method !== "POST") return json({ ok: false, error_code: "method_not_allowed" }, 405, req);

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ ok: false, error_code: "unauthorized" }, 401, req);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const authUserId = authData.user?.id;
    if (authError || !authUserId) return json({ ok: false, error_code: "unauthorized" }, 401, req);

    const body = (await req.json()) as { ride_id?: unknown; reason?: unknown };
    const rideId = String(body.ride_id ?? "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rideId)) {
      return json({ ok: false, error_code: "invalid_ride_id", message: "Corrida inválida." }, 422, req);
    }

    const reason = typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 500)
      : "Cancelada pelo passageiro";

    // The database RPC owns the complete transaction: ride state transition,
    // cancellation debt creation and passenger-wallet blocking. Keeping these
    // writes in one transaction prevents a cancelled ride from being committed
    // without its corresponding debt/block projection.
    const { data, error } = await admin.rpc("service_cancel_passenger_ride", {
      _auth_user_id: authUserId,
      _ride_id: rideId,
      _reason: reason,
    });

    if (error) {
      console.error("[cancel-ride] atomic RPC failed", {
        code: error.code,
        message: error.message,
      });
      return json({ ok: false, error_code: "cancellation_transaction_failed" }, 500, req);
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      console.error("[cancel-ride] invalid atomic RPC response");
      return json({ ok: false, error_code: "cancellation_transaction_failed" }, 500, req);
    }

    const result = data as Record<string, unknown>;
    const ok = result.ok === true;
    if (!ok) {
      const errorCode = typeof result.error_code === "string"
        ? result.error_code
        : "cancellation_transaction_failed";
      return json(result, statusForError(errorCode), req);
    }

    return json(result, 200, req);
  } catch (error) {
    console.error("[cancel-ride] fatal", error);
    return json({ ok: false, error_code: "internal_error" }, 500, req);
  }
});
