import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DriverAction = "accept" | "reject" | "arrive" | "start" | "finish";
type RequestBody = {
  ride_id?: string;
  action?: DriverAction;
  security_code?: string;
  final_price?: number;
};

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "content-type": "application/json" },
  });
}

function bearer(req: Request): string {
  return (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}

function isAction(value: unknown): value is DriverAction {
  return ["accept", "reject", "arrive", "start", "finish"].includes(String(value));
}

async function callDriverWorkflow(
  token: string,
  slug: "driver-reject-redispatch" | "driver-finish-redispatch",
  body: Record<string, unknown>,
): Promise<{ status: number; payload: Record<string, unknown> }> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${slug}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: ANON_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { status: response.status, payload };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
      return json(req, { error: "server_configuration_missing" }, 500);
    }

    const token = bearer(req);
    if (!token) return json(req, { error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({})) as RequestBody;
    const rideId = String(body.ride_id ?? "").trim();
    if (!UUID_PATTERN.test(rideId)) return json(req, { error: "invalid_ride_id" }, 422);
    if (!isAction(body.action)) return json(req, { error: "invalid_action" }, 422);

    // Compatibility entrypoint only. All lifecycle authority lives in the
    // canonical transactional RPCs / redispatch workflows. final_price from
    // the client is intentionally ignored and can never alter settlement.
    if (body.action === "reject") {
      const result = await callDriverWorkflow(token, "driver-reject-redispatch", { ride_id: rideId });
      return json(req, result.payload, result.status);
    }

    if (body.action === "finish") {
      const result = await callDriverWorkflow(token, "driver-finish-redispatch", { ride_id: rideId });
      return json(req, result.payload, result.status);
    }

    const driverClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const rpc = body.action === "accept"
      ? "driver_accept_ride"
      : body.action === "arrive"
      ? "driver_mark_arrived"
      : "driver_start_ride";
    const params = body.action === "start"
      ? { _ride_id: rideId, _security_code: String(body.security_code ?? "") }
      : { _ride_id: rideId };

    const { data, error } = await driverClient.rpc(rpc, params);
    if (error) {
      const message = error.message || "driver_ride_action_failed";
      const status = /unauthorized|not_approved|suspended|offline|subscription/i.test(message)
        ? 403
        : /invalid|unavailable|busy|locked|location|distance|pickup/i.test(message)
        ? 409
        : 500;
      return json(req, { error: message }, status);
    }

    return json(req, { ok: true, action: body.action, ride: data }, 200);
  } catch (error) {
    console.error("[driver-ride-action] fatal", error);
    return json(req, { error: "internal_error" }, 500);
  }
});
