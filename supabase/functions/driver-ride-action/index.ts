import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

type DriverAction = "accept" | "reject" | "arrive" | "start" | "finish";

type RequestBody = {
  ride_id?: string;
  action?: DriverAction;
  security_code?: string;
  /**
   * Campo legado propositalmente rejeitado. O preço final nunca é aceito do
   * cliente; `driver_finish_ride` calcula/persiste o valor no banco.
   */
  final_price?: unknown;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "content-type": "application/json",
    },
  });
}

function isAction(value: unknown): value is DriverAction {
  return ["accept", "reject", "arrive", "start", "finish"].includes(String(value));
}

function normalizeCode(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").slice(0, 8);
}

function pushEventFor(action: DriverAction): string | null {
  switch (action) {
    case "accept":
      return "ride.accepted";
    case "arrive":
      return "ride.driver_arrived";
    case "start":
      return "ride.started";
    case "finish":
      return "ride.completed";
    case "reject":
    default:
      return null;
  }
}

async function triggerWooviDriverCredit(): Promise<void> {
  if (!SERVICE_ROLE) {
    console.warn("[driver-ride-action] Woovi credit worker skipped: service role missing");
    return;
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/driver-woovi-credit`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
      "content-type": "application/json",
    },
    body: "{}",
  });
  if (!response.ok) {
    console.warn("[driver-ride-action] Woovi credit worker unavailable", {
      status: response.status,
      detail: (await response.text()).slice(0, 500),
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json(req, { error: "backend_configuration_missing" }, 503);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(authHeader)) {
    return json(req, { error: "unauthorized" }, 401);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json(req, { error: "invalid_json" }, 400);
  }

  const rideId = String(body.ride_id ?? "").trim();
  if (!UUID_PATTERN.test(rideId)) return json(req, { error: "invalid_ride_id" }, 422);
  if (!isAction(body.action)) return json(req, { error: "invalid_action" }, 422);

  // Gate explícito contra o contrato legado perigoso: mesmo que um APK antigo
  // ainda tente mandar `final_price`, o backend não o usa nem o aceita.
  if (body.final_price !== undefined) {
    return json(
      req,
      {
        error: "client_price_not_allowed",
        message: "O valor final da corrida é definido exclusivamente pelo backend.",
      },
      422,
    );
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return json(req, { error: "unauthorized" }, 401);

  let rpcName: string;
  let rpcArgs: Record<string, unknown> = { _ride_id: rideId };

  switch (body.action) {
    case "accept":
      rpcName = "driver_accept_ride";
      break;
    case "reject":
      rpcName = "driver_reject_ride";
      break;
    case "arrive":
      rpcName = "driver_mark_arrived";
      break;
    case "start": {
      const securityCode = normalizeCode(body.security_code);
      if (!securityCode) return json(req, { error: "security_code_required" }, 422);
      rpcName = "driver_start_ride";
      rpcArgs = { ...rpcArgs, _security_code: securityCode };
      break;
    }
    case "finish":
      rpcName = "driver_finish_ride";
      break;
  }

  const { data, error } = await client.rpc(rpcName, rpcArgs);
  if (error) {
    console.error("[driver-ride-action] canonical RPC failed", {
      action: body.action,
      rideId,
      code: error.code,
      message: error.message,
    });
    return json(
      req,
      {
        error: "driver_action_failed",
        detail: error.message,
      },
      error.code === "42501" ? 403 : 409,
    );
  }

  const pushEvent = pushEventFor(body.action);
  if (pushEvent) {
    EdgeRuntime.waitUntil(
      client.functions
        .invoke("send-ride-push", {
          body: {
            event: pushEvent,
            ride_id: rideId,
          },
        })
        .then(({ error: pushError }) => {
          if (pushError) {
            console.warn("[driver-ride-action] push unavailable", {
              action: body.action,
              rideId,
              message: pushError.message,
            });
          }
        })
        .catch((pushError) => {
          console.warn("[driver-ride-action] push failed", {
            action: body.action,
            rideId,
            message: pushError instanceof Error ? pushError.message : String(pushError),
          });
        }),
    );
  }

  if (body.action === "finish") {
    EdgeRuntime.waitUntil(
      triggerWooviDriverCredit().catch((creditError) => {
        console.warn("[driver-ride-action] Woovi credit trigger failed", {
          rideId,
          message: creditError instanceof Error ? creditError.message : String(creditError),
        });
      }),
    );
  }

  return json(req, {
    ok: true,
    action: body.action,
    ride_id: rideId,
    ride: data,
  });
});
