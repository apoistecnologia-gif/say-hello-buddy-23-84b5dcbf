import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  createMonthlyPreference,
  findCurrentPaidSubscription,
  findReusablePendingCharge,
  loadBillingPlan,
  persistPendingCharge,
} from "../_shared/mercadopago.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 
      ...(req ? getCorsHeaders(req) : {}),
      "content-type": "application/json" 
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, req);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401, req);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: auth, error: authError } = await userClient.auth.getUser();
    if (authError || !auth.user) return json({ error: "unauthorized" }, 401, req);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: driver, error: driverError } = await admin
      .from("drivers")
      .select("id,user_id,name,email,approval_status")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (driverError || !driver) return json({ error: "driver_not_found" }, 404, req);
    if (driver.approval_status !== "aprovado") return json({ error: "driver_not_approved" }, 403, req);
    const currentPaid = await findCurrentPaidSubscription(admin, driver.user_id);
    if (currentPaid) return json({ error: "already_active" }, 409, req);
    if (!driver.name?.trim() || !driver.email?.trim()) {
      return json({ error: "missing_required_fields", missing: ["nome/e-mail"] }, 422, req);
    }

    const reusable = await findReusablePendingCharge(admin, driver.user_id);
    if (reusable) {
      return json({
        ok: true,
        reused: true,
        initPoint: reusable.invoice_url,
        preapprovalId: reusable.provider_reference,
        amount: reusable.amount,
      }, 200, req);
    }

    const plan = await loadBillingPlan(admin);
    const chargeId = crypto.randomUUID();
    const { preference, initPoint } = await createMonthlyPreference({
      driver,
      plan,
      source: "driver_self_service",
      supabaseUrl: SUPABASE_URL,
      chargeId,
    });
    const persisted = await persistPendingCharge({
      admin,
      driver,
      plan,
      preference,
      initPoint,
      source: "driver_self_service",
      actorId: auth.user.id,
      chargeId,
    });
    return json({
      ok: true,
      reused: false,
      initPoint,
      preapprovalId: preference.id,
      dueDate: persisted.dueDate,
      amount: plan.amount,
    }, 200, req);
  } catch (error) {
    const detail = String(error).slice(0, 300);
    console.error("[create-my-mp]", detail);
    return json({ error: "processing_failed", detail }, 500, req);
  }
});
