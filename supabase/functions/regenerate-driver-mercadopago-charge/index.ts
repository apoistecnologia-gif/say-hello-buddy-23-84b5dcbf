import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  createMonthlyPreference,
  findReusablePendingCharge,
  loadBillingPlan,
  persistPendingCharge,
} from "../_shared/mercadopago.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer "))
      return json({ error: "unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: auth, error: authError } = await userClient.auth.getUser();
    if (authError || !auth.user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: roles, error: roleError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", auth.user.id)
      .in("role", ["admin", "super_admin"])
      .limit(1);
    if (roleError) return json({ error: "role_check_failed" }, 500);
    if (!roles?.length) return json({ error: "forbidden" }, 403);

    const body = (await req.json().catch(() => null)) as {
      driverId?: unknown;
    } | null;
    if (typeof body?.driverId !== "string")
      return json({ error: "missing_driverId" }, 400);
    const { data: driver, error: driverError } = await admin
      .from("drivers")
      .select("id,user_id,name,email,approval_status")
      .eq("id", body.driverId)
      .maybeSingle();
    if (driverError || !driver) return json({ error: "driver_not_found" }, 404);
    if (driver.approval_status !== "aprovado")
      return json({ error: "driver_not_approved" }, 422);

    const reusable = await findReusablePendingCharge(admin, driver.user_id);
    if (reusable) {
      return json({
        ok: true,
        reused: true,
        preferenceId: reusable.provider_reference,
        initPoint: reusable.invoice_url,
        amount: reusable.amount,
      });
    }

    const plan = await loadBillingPlan(admin);
    const chargeId = crypto.randomUUID();
    const { preference, initPoint } = await createMonthlyPreference({
      driver,
      plan,
      source: "admin_manual",
      supabaseUrl: SUPABASE_URL,
      chargeId,
    });
    const persisted = await persistPendingCharge({
      admin,
      driver,
      plan,
      preference,
      initPoint,
      source: "admin_manual",
      actorId: auth.user.id,
      chargeId,
    });
    await admin.from("notification_inbox").insert({
      user_id: driver.user_id,
      title: "Nova cobrança disponível",
      body: "Sua mensalidade MOVVI está pronta para pagamento.",
      category: "payment",
      data: { init_point: initPoint, kind: "monthly_fee" },
    });

    return json({
      ok: true,
      reused: false,
      preferenceId: preference.id,
      initPoint,
      dueDate: persisted.dueDate,
      amount: plan.amount,
    });
  } catch (error) {
    const detail = String(error).slice(0, 300);
    console.error("[regenerate-mp]", detail);
    return json({ error: "processing_failed", detail }, 500);
  }
});
