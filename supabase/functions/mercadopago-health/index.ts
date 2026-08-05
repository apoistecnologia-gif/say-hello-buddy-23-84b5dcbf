import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { mercadoPagoBaseUrl } from "../_shared/mercadopago.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
import { getCorsHeaders } from "../_shared/cors.ts";


function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: getCorsHeaders(req),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  if (req.method !== "POST") return json(req, { ok: false, error: "method_not_allowed" }, 405);

  try {
    const authorization = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json(req, { ok: false, error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });
    const { data: role } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", authData.user.id)
      .in("role", ["admin", "super_admin", "financial"])
      .limit(1)
      .maybeSingle();
    if (!role) return json(req, { ok: false, error: "forbidden" }, 403);

    const token = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN")?.trim();
    const webhookSecret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET")?.trim();
    if (!token || !webhookSecret) {
      return json(req, {
        ok: false,
        error: "missing_secrets",
        accessTokenConfigured: Boolean(token),
        webhookSecretConfigured: Boolean(webhookSecret),
      });
    }

    const response = await fetch(`${mercadoPagoBaseUrl()}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      return json(req, {
        ok: false,
        error: "provider_rejected_credentials",
        providerStatus: response.status,
      });
    }

    const account = (await response.json()) as { id?: number | string; site_id?: string };
    return json(req, {
      ok: true,
      provider: "mercadopago",
      accountId: account.id ? String(account.id) : null,
      siteId: account.site_id ?? null,
      webhookSecretConfigured: true,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("mercadopago-health", error);
    return json(req, { ok: false, error: "health_check_failed" }, 500);
  }
});
