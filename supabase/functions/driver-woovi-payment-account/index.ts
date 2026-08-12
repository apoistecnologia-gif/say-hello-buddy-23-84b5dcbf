import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WOOVI_APP_ID = (Deno.env.get("WOOVI_APP_ID") ?? "").trim();
const WOOVI_API_BASE_URL = (Deno.env.get("WOOVI_API_BASE_URL") ?? "https://api.openpix.com.br").replace(/\/+$/, "");

type JsonObject = Record<string, unknown>;

function json(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...(req ? getCorsHeaders(req) : {}), "content-type": "application/json" },
  });
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanPixKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim();
  return key.length >= 5 && key.length <= 160 ? key : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, req);
  if (!WOOVI_APP_ID) return json({ error: "payment_provider_not_configured" }, 503, req);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401, req);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const authUser = authData.user;
  if (authError || !authUser) return json({ error: "unauthorized" }, 401, req);

  let input: JsonObject;
  try {
    const parsed = await req.json();
    input = isObject(parsed) ? parsed : {};
  } catch {
    return json({ error: "invalid_json" }, 400, req);
  }

  const pixKey = cleanPixKey(input.pixKey);
  if (!pixKey) return json({ error: "invalid_pix_key" }, 422, req);

  try {
    const { data: userRow, error: userError } = await admin
      .from("users")
      .select("id,deleted_at")
      .eq("auth_user_id", authUser.id)
      .maybeSingle();
    if (userError) throw new Error(`user_lookup_failed:${userError.message}`);
    if (!userRow || userRow.deleted_at) return json({ error: "user_profile_missing" }, 404, req);

    const { data: driver, error: driverError } = await admin
      .from("drivers")
      .select("id,name,approval_status")
      .eq("user_id", userRow.id)
      .maybeSingle();
    if (driverError) throw new Error(`driver_lookup_failed:${driverError.message}`);
    if (!driver) return json({ error: "driver_profile_missing" }, 404, req);
    if (driver.approval_status !== "aprovado") return json({ error: "driver_not_approved" }, 403, req);

    const { data: existing, error: existingError } = await admin
      .from("driver_payment_accounts")
      .select("id,pix_key,status,provider_subaccount_id,verified_at")
      .eq("driver_id", driver.id)
      .eq("provider", "woovi")
      .maybeSingle();
    if (existingError) throw new Error(`payment_account_lookup_failed:${existingError.message}`);

    if (existing) {
      if (existing.pix_key !== pixKey) {
        return json({
          error: "pix_key_change_requires_support",
          message: "Por segurança, a alteração de uma chave Pix já vinculada deve ser confirmada pelo suporte APOIS.",
        }, 409, req);
      }
      return json({ ok: true, reused: true, status: existing.status, verifiedAt: existing.verified_at }, 200, req);
    }

    const providerResponse = await fetch(`${WOOVI_API_BASE_URL}/api/v1/subaccount`, {
      method: "POST",
      headers: {
        Authorization: WOOVI_APP_ID,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        name: String(driver.name ?? `Motorista APOIS ${driver.id}`).slice(0, 120),
        pixKey,
      }),
    });
    const providerText = await providerResponse.text();
    let providerBody: JsonObject | null = null;
    try {
      const parsed = providerText ? JSON.parse(providerText) : null;
      providerBody = isObject(parsed) ? parsed : null;
    } catch {
      providerBody = null;
    }

    if (!providerResponse.ok) {
      console.error("[driver-woovi-payment-account] provider", providerResponse.status, providerText.slice(0, 500));
      return json({ error: "pix_key_provider_validation_failed" }, 422, req);
    }

    const subAccount = providerBody && isObject(providerBody.SubAccount) ? providerBody.SubAccount : null;
    const returnedPixKey = typeof subAccount?.pixKey === "string" ? subAccount.pixKey : pixKey;
    if (returnedPixKey !== pixKey) throw new Error("provider_pix_key_mismatch");

    const { data: created, error: insertError } = await admin
      .from("driver_payment_accounts")
      .insert({
        driver_id: driver.id,
        provider: "woovi",
        pix_key: pixKey,
        provider_subaccount_id: returnedPixKey,
        status: "active",
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id,status,verified_at")
      .single();
    if (insertError) throw new Error(`payment_account_insert_failed:${insertError.message}`);

    return json({ ok: true, reused: false, status: created.status, verifiedAt: created.verified_at }, 200, req);
  } catch (error) {
    console.error("[driver-woovi-payment-account]", error);
    return json({ error: "driver_payment_account_failed" }, 500, req);
  }
});
