import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function cronBearer(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
}

export const Route = createFileRoute("/api/public/hooks/activate-scheduled-rides")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET?.trim() ?? "";
        if (!cronSecret) {
          return json({ error: "cron_secret_not_configured" }, 503);
        }

        if (cronBearer(request) !== cronSecret) {
          return json({ error: "unauthorized" }, 401);
        }

        // Legacy Render compatibility hook only. Production scheduling is owned
        // by Supabase pg_cron. If an old external cron still calls this route,
        // it reuses the same transactional activation RPC and the single
        // canonical dispatch engine instead of maintaining a second policy.
        const { data: activationRows, error: activationError } = await supabaseAdmin.rpc(
          "activate_due_scheduled_rides",
          { _lead_minutes: 15, _limit: 100 },
        );

        if (activationError) {
          console.error("[scheduled-rides-compat] activation failed", activationError);
          return json({ error: "activation_failed" }, 500);
        }

        const rows = Array.isArray(activationRows)
          ? activationRows as Array<{ ride_id?: string; schedule_status?: string }>
          : [];
        const activatedIds = rows
          .filter((row) => row.schedule_status === "activated" && row.ride_id)
          .map((row) => String(row.ride_id));

        // Recovery matches the primary scheduler: if activation committed but a
        // dispatch request failed, retry only rows that never attempted dispatch.
        const recovery = await supabaseAdmin
          .from("rides")
          .select("id")
          .eq("status", "procurar_motorista")
          .not("scheduled_for", "is", null)
          .not("scheduled_activated_at", "is", null)
          .is("driver_id", null)
          .is("accepted_driver_id", null)
          .eq("dispatch_attempts", 0)
          .limit(100);

        if (recovery.error) {
          console.error("[scheduled-rides-compat] recovery lookup failed", recovery.error);
        }

        const rideIds = [...new Set([
          ...activatedIds,
          ...((recovery.data ?? []).map((row) => String(row.id))),
        ])];

        let dispatchFailed = 0;
        for (const rideId of rideIds) {
          const { error } = await supabaseAdmin.functions.invoke("dispatch-ride", {
            body: { ride_id: rideId, mode: "initial" },
          });
          if (error) {
            dispatchFailed += 1;
            console.error("[scheduled-rides-compat] canonical dispatch failed", {
              rideId,
              message: error.message,
            });
          }
        }

        return json({
          ok: true,
          source: "legacy_compatibility_hook",
          activated: activatedIds.length,
          expired: rows.filter((row) => row.schedule_status === "expired").length,
          dispatch_attempted: rideIds.length,
          dispatch_failed: dispatchFailed,
        });
      },
    },
  },
});
