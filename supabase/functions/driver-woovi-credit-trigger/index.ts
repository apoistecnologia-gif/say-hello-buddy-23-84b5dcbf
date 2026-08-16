import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const token = (req.headers.get("x-apois-worker-token") ?? "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: valid, error: tokenError } = await admin.rpc(
    "verify_driver_credit_worker_token",
    { _token: token },
  );
  if (tokenError) {
    console.error("[driver-woovi-credit-trigger] token verification failed", tokenError);
    return json({ error: "worker_token_verification_failed" }, 500);
  }
  if (valid !== true) return json({ error: "unauthorized" }, 401);

  let payload: unknown = {};
  try { payload = await req.json(); } catch { payload = {}; }

  const workerResponse = await fetch(`${SUPABASE_URL}/functions/v1/driver-woovi-credit`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await workerResponse.text();
  let body: unknown = text;
  try { body = text ? JSON.parse(text) : {}; } catch { /* keep text */ }

  return json({
    ok: workerResponse.ok,
    workerStatus: workerResponse.status,
    worker: body,
  }, workerResponse.ok ? 200 : 502);
});