import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  try {
    if (!SUPABASE_URL || !ANON_KEY) {
      return json(req, { error: "server_configuration_missing" }, 500);
    }

    const authorization = (req.headers.get("Authorization") ?? "").trim();
    if (!authorization) return json(req, { error: "unauthorized" }, 401);

    const rawBody = await req.text();
    const response = await fetch(`${SUPABASE_URL}/functions/v1/passenger-ride-request`, {
      method: "POST",
      headers: {
        Authorization: authorization,
        apikey: ANON_KEY,
        "content-type": "application/json",
      },
      body: rawBody,
    });

    const responseBody = await response.text();
    return new Response(responseBody, {
      status: response.status,
      headers: { ...getCorsHeaders(req), "content-type": "application/json" },
    });
  } catch (error) {
    console.error("[request-ride] compatibility proxy failed", error);
    return json(req, { error: "internal_error" }, 500);
  }
});
