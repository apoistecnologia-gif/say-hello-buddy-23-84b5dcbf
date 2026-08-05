import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  createMonthlyPreference,
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
    const { data: roles, error: roleError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", auth.user.id)
      .in("role", ["admin", "super_admin"])
      .limit(1);
    if (roleError) return json({ error: "role_check_failed" }, 500, req);
    if (!roles?.length) return json({ error: "forbidden" }, 403, req);

    const body = (await req.json().catch(() => null)) as {
      driverId?: unknown;
    } | null;
    if (typeof body?.driverId !== "string") return json({ error: "missing_driverId" }, 400, req);

    const { data: driver, error: driverError } = await admin
      .from("drivers")
      .select(
        "id,user_id,name,email,phone,cpf,city,state,approval_status,selfie_url,cnh_url,vehicle_document_url",
      )
      .eq("id", body.driverId)
      .maybeSingle();
    if (driverError || !driver) return json({ error: "driver_not_found" }, 404, req);

    const missing: string[] = [];
    if (!driver.name?.trim()) missing.push("nome");
    if (!driver.email?.trim()) missing.push("email");
    if (!driver.phone?.trim()) missing.push("telefone");
    if (!driver.cpf?.trim()) missing.push("CPF/CNPJ");
    if (!driver.city?.trim()) missing.push("cidade");
    if (!driver.state?.trim()) missing.push("estado");
    if (!driver.selfie_url) missing.push("selfie");
    if (!driver.cnh_url) missing.push("CNH");
    if (!driver.vehicle_document_url) missing.push("documento do veículo");
    if (missing.length) return json({ error: "missing_required_fields", missing }, 422, req);

    const reusable = await findReusablePendingCharge(admin, driver.user_id);
    if (reusable) {
      const approvalResult = await admin
        .from("drivers")
        .update({
          approval_status: "aprovado",
          approved_at: new Date().toISOString(),
          documents_status: "approved",
        })
        .eq("id", driver.id);
      if (approvalResult.error) throw new Error(approvalResult.error.message);
      return json({
        ok: true,
        alreadyExists: true,
        preapprovalId: reusable.provider_reference,
        initPoint: reusable.invoice_url,
      }, 200, req);
    }

    const plan = await loadBillingPlan(admin);
    const chargeId = crypto.randomUUID();
    const { preference, initPoint } = await createMonthlyPreference({
      driver,
      plan,
      source: "admin_approval",
      supabaseUrl: SUPABASE_URL,
      chargeId,
    });
    const persisted = await persistPendingCharge({
      admin,
      driver,
      plan,
      preference,
      initPoint,
      source: "admin_approval",
      actorId: auth.user.id,
      chargeId,
    });
    const approvalResult = await admin
      .from("drivers")
      .update({
        approval_status: "aprovado",
        approved_at: new Date().toISOString(),
        documents_status: "approved",
      })
      .eq("id", driver.id);
    if (approvalResult.error) throw new Error(approvalResult.error.message);

    return json({
      ok: true,
      alreadyExists: false,
      preapprovalId: preference.id,
      initPoint,
      dueDate: persisted.dueDate,
      amount: plan.amount,
    }, 200, req);
  } catch (error) {
    const detail = String(error).slice(0, 300);
    console.error("[approve-driver-mp]", detail);
    return json({ error: "processing_failed", detail }, 500, req);
  }
});
