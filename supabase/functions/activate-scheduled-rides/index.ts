import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SCHEDULER_TOKEN_HEADER = "x-apois-scheduler-token";
const SCHEDULER_NAME = "scheduled_ride_activation";
const LEAD_MINUTES = 15;
const BATCH_LIMIT = 100;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

async function dispatchRide(rideId: string): Promise<{ ok: boolean; status: number; body: string }> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/dispatch-ride`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
      "content-type": "application/json",
    },
    body: JSON.stringify({ ride_id: rideId, mode: "initial" }),
  });
  const body = await response.text();
  return { ok: response.ok, status: response.status, body };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return json({ error: "server_configuration_missing" }, 500);
    }

    const schedulerToken = text(req.headers.get(SCHEDULER_TOKEN_HEADER));
    if (schedulerToken.length < 32 || schedulerToken.length > 256) {
      return json({ error: "unauthorized" }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: tokenValid, error: tokenError } = await admin.rpc(
      "validate_internal_scheduler_token",
      { _name: SCHEDULER_NAME, _token: schedulerToken },
    );
    if (tokenError || tokenValid !== true) {
      console.error("[activate-scheduled-rides] scheduler token rejected", tokenError?.message);
      return json({ error: "unauthorized" }, 401);
    }

    const { data: activationRows, error: activationError } = await admin.rpc(
      "activate_due_scheduled_rides",
      { _lead_minutes: LEAD_MINUTES, _limit: BATCH_LIMIT },
    );
    if (activationError) {
      console.error("[activate-scheduled-rides] activation failed", activationError.message);
      return json({ error: "activation_failed" }, 500);
    }

    const rows = Array.isArray(activationRows)
      ? activationRows as Array<Record<string, unknown>>
      : [];
    const activatedIds = rows
      .filter((row) => text(row.schedule_status) === "activated")
      .map((row) => text(row.ride_id))
      .filter(Boolean);

    // Recovery path: if activation committed but the HTTP dispatch failed, the
    // next cron execution retries any scheduled ride that still has no dispatch
    // attempt. dispatch-ride itself is concurrency-safe and expires stale search.
    const { data: recoverable, error: recoveryError } = await admin
      .from("rides")
      .select("id")
      .eq("status", "procurar_motorista")
      .not("scheduled_for", "is", null)
      .not("scheduled_activated_at", "is", null)
      .is("driver_id", null)
      .is("accepted_driver_id", null)
      .eq("dispatch_attempts", 0)
      .limit(BATCH_LIMIT);
    if (recoveryError) {
      console.error("[activate-scheduled-rides] recovery lookup failed", recoveryError.message);
    }

    const rideIds = [...new Set([
      ...activatedIds,
      ...((recoverable ?? []).map((row) => text(row.id)).filter(Boolean)),
    ])];

    const dispatchResults = await Promise.all(
      rideIds.map(async (rideId) => {
        try {
          const result = await dispatchRide(rideId);
          if (!result.ok) {
            console.error("[activate-scheduled-rides] dispatch failed", {
              rideId,
              status: result.status,
              body: result.body.slice(0, 300),
            });
          }
          return { rideId, ok: result.ok, status: result.status };
        } catch (error) {
          console.error("[activate-scheduled-rides] dispatch request failed", rideId, error);
          return { rideId, ok: false, status: 0 };
        }
      }),
    );

    return json({
      ok: true,
      activated: activatedIds.length,
      expired: rows.filter((row) => text(row.schedule_status) === "expired").length,
      dispatch_attempted: dispatchResults.length,
      dispatch_failed: dispatchResults.filter((result) => !result.ok).length,
    });
  } catch (error) {
    console.error("[activate-scheduled-rides] fatal", error);
    return json({ error: "internal_error" }, 500);
  }
});
