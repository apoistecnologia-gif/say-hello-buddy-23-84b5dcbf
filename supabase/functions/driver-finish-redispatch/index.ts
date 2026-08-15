import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "content-type": "application/json" },
  });
}

function bearer(req: Request): string {
  return (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}

function text(value: unknown, maxLength = 80): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

async function triggerRedispatch(rideId: string): Promise<{ ok: boolean; action?: string; status: number }> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/dispatch-ride`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE}`,
        apikey: SERVICE_ROLE,
        "content-type": "application/json",
      },
      body: JSON.stringify({ ride_id: rideId, mode: "redispatch" }),
    });
    const payload = await response.json().catch(() => ({})) as { action?: string };
    return { ok: response.ok, action: payload.action, status: response.status };
  } catch (error) {
    console.error("[driver-finish-redispatch] dispatch fetch failed", error);
    return { ok: false, status: 0 };
  }
}

async function retryRedispatch(rideId: string): Promise<void> {
  for (const delayMs of [2000, 5000, 10000]) {
    await sleep(delayMs);
    const result = await triggerRedispatch(rideId);
    if (result.ok) {
      console.log("[driver-finish-redispatch] deferred redispatch recovered", {
        rideId,
        action: result.action,
      });
      return;
    }
  }
  console.error("[driver-finish-redispatch] deferred redispatch exhausted", { rideId });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE) return json(req, { error: "server_configuration_missing" }, 500);

    const token = bearer(req);
    if (!token) return json(req, { error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const rideId = text(body.ride_id, 50);
    if (!UUID_PATTERN.test(rideId)) return json(req, { error: "invalid_ride_id" }, 422);

    const driverClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: finishedRide, error: finishError } = await driverClient.rpc("driver_finish_ride", {
      _ride_id: rideId,
    });
    if (finishError) {
      return json(req, { error: finishError.message || "driver_finish_failed" }, 409);
    }

    const record = finishedRide && typeof finishedRide === "object"
      ? finishedRide as Record<string, unknown>
      : {};
    const releasedQueuedRideId = text(record.released_queued_ride_id, 50);

    if (!UUID_PATTERN.test(releasedQueuedRideId)) {
      return json(req, {
        ok: true,
        ride: finishedRide,
        redispatch: "not_required",
      });
    }

    const redispatch = await triggerRedispatch(releasedQueuedRideId);
    if (!redispatch.ok) {
      EdgeRuntime.waitUntil(retryRedispatch(releasedQueuedRideId));
      return json(req, {
        ok: true,
        ride: finishedRide,
        released_queued_ride_id: releasedQueuedRideId,
        redispatch: "deferred",
      });
    }

    return json(req, {
      ok: true,
      ride: finishedRide,
      released_queued_ride_id: releasedQueuedRideId,
      redispatch: redispatch.action ?? "triggered",
    });
  } catch (error) {
    console.error("[driver-finish-redispatch] fatal", error);
    return json(req, { error: "internal_error" }, 500);
  }
});
