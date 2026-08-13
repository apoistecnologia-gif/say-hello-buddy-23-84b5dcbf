import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ASAAS_ENVIRONMENT = (Deno.env.get("ASAAS_ENVIRONMENT") ?? "production").trim().toLowerCase();
const ASAAS_API_KEY = (Deno.env.get("ASAAS_API_KEY") ?? "").trim();
const ASAAS_BASE_URL = ASAAS_ENVIRONMENT === "sandbox"
  ? "https://api-sandbox.asaas.com/v3"
  : "https://api.asaas.com/v3";
const WOOVI_APP_ID = (Deno.env.get("WOOVI_APP_ID") ?? "").trim();
const WOOVI_API_BASE_URL = (Deno.env.get("WOOVI_API_BASE_URL") ?? "https://api.woovi.com").replace(/\/+$/, "");

type ActiveCharge = {
  id: string;
  provider: string;
  provider_payment_id: string | null;
  status: string;
};

type ProviderCancellation = {
  cancelled: boolean;
  reconciliationRequired: boolean;
  detail: string;
};

function json(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...(req ? getCorsHeaders(req) : {}), "content-type": "application/json" },
  });
}

function statusForError(errorCode: string): number {
  switch (errorCode) {
    case "unauthorized":
      return 401;
    case "passenger_profile_missing":
    case "ride_not_found":
      return 404;
    case "invalid_ride_id":
      return 422;
    case "cancellation_not_allowed":
    case "invalid_ride_status":
    case "paid_pix_cancellation_policy_required":
      return 409;
    default:
      return 500;
  }
}

async function cancelProviderCharge(charge: ActiveCharge): Promise<ProviderCancellation> {
  const provider = charge.provider.toLowerCase();
  const paymentId = charge.provider_payment_id?.trim() ?? "";
  if (!paymentId) {
    return {
      cancelled: false,
      reconciliationRequired: true,
      detail: "provider_payment_id_missing",
    };
  }

  let response: Response;
  try {
    if (provider === "asaas") {
      if (!ASAAS_API_KEY) {
        return { cancelled: false, reconciliationRequired: true, detail: "asaas_not_configured" };
      }
      response = await fetch(`${ASAAS_BASE_URL}/payments/${encodeURIComponent(paymentId)}`, {
        method: "DELETE",
        headers: {
          accept: "application/json",
          access_token: ASAAS_API_KEY,
          "User-Agent": `APOIS-Corridas/1.0 (${ASAAS_ENVIRONMENT}; Supabase Edge)`,
        },
      });
    } else if (provider === "woovi") {
      if (!WOOVI_APP_ID) {
        return { cancelled: false, reconciliationRequired: true, detail: "woovi_not_configured" };
      }
      response = await fetch(`${WOOVI_API_BASE_URL}/api/v1/charge/${encodeURIComponent(paymentId)}`, {
        method: "DELETE",
        headers: {
          Authorization: WOOVI_APP_ID,
          accept: "application/json",
        },
      });
    } else {
      return { cancelled: false, reconciliationRequired: true, detail: `unsupported_provider:${provider}` };
    }
  } catch (error) {
    return {
      cancelled: false,
      reconciliationRequired: true,
      detail: `provider_transport_unknown:${String(error).slice(0, 300)}`,
    };
  }

  const raw = (await response.text()).slice(0, 700);
  if (response.ok) {
    return { cancelled: true, reconciliationRequired: false, detail: raw || "provider_charge_deleted" };
  }

  // A provider-side 404 means the charge is no longer available under that
  // identifier, so there is no active charge for the passenger to pay.
  if (response.status === 404) {
    return { cancelled: true, reconciliationRequired: false, detail: "provider_charge_not_found" };
  }

  // 4xx/5xx can also occur after a concurrent payment. Never pretend that the
  // money was cancelled; leave the internal payment row non-terminal so the
  // webhook/reconciliation path can observe a late payment.
  return {
    cancelled: false,
    reconciliationRequired: true,
    detail: `provider_delete_failed:${response.status}:${raw}`,
  };
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
    if (req.method !== "POST") return json({ ok: false, error_code: "method_not_allowed" }, 405, req);

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ ok: false, error_code: "unauthorized" }, 401, req);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const authUserId = authData.user?.id;
    if (authError || !authUserId) return json({ ok: false, error_code: "unauthorized" }, 401, req);

    const body = (await req.json()) as { ride_id?: unknown; reason?: unknown };
    const rideId = String(body.ride_id ?? "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rideId)) {
      return json({ ok: false, error_code: "invalid_ride_id", message: "Corrida inválida." }, 422, req);
    }

    const reason = typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 500)
      : "Cancelada pelo passageiro";

    // Snapshot an unpaid electronic charge before the atomic ride transition.
    // Ownership is still enforced by service_cancel_passenger_ride below.
    const { data: activeChargeRow, error: activeChargeError } = await admin
      .from("ride_pix_payments")
      .select("id,provider,provider_payment_id,status")
      .eq("ride_id", rideId)
      .in("status", ["creating", "pending", "confirmed"])
      .order("attempt_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeChargeError) {
      console.error("[cancel-ride] active Pix lookup failed", activeChargeError);
      return json({ ok: false, error_code: "cancellation_transaction_failed" }, 500, req);
    }

    // The database RPC owns the complete local transaction: ride state
    // transition, cancellation debt creation and passenger-wallet blocking.
    const { data, error } = await admin.rpc("service_cancel_passenger_ride", {
      _auth_user_id: authUserId,
      _ride_id: rideId,
      _reason: reason,
    });

    if (error) {
      console.error("[cancel-ride] atomic RPC failed", {
        code: error.code,
        message: error.message,
      });
      return json({ ok: false, error_code: "cancellation_transaction_failed" }, 500, req);
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      console.error("[cancel-ride] invalid atomic RPC response");
      return json({ ok: false, error_code: "cancellation_transaction_failed" }, 500, req);
    }

    const result = data as Record<string, unknown>;
    const ok = result.ok === true;
    if (!ok) {
      const errorCode = typeof result.error_code === "string"
        ? result.error_code
        : "cancellation_transaction_failed";
      return json(result, statusForError(errorCode), req);
    }

    let paymentCancellation: ProviderCancellation | null = null;
    const activeCharge = activeChargeRow as ActiveCharge | null;
    if (activeCharge) {
      paymentCancellation = await cancelProviderCharge(activeCharge);

      if (paymentCancellation.cancelled) {
        const { error: localPaymentError } = await admin
          .from("ride_pix_payments")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", activeCharge.id)
          .in("status", ["creating", "pending", "confirmed"]);
        if (localPaymentError) {
          console.error("[cancel-ride] local payment cancellation persist failed", localPaymentError);
          paymentCancellation = {
            cancelled: false,
            reconciliationRequired: true,
            detail: `provider_deleted_local_persist_failed:${localPaymentError.message}`,
          };
        }
      }

      if (paymentCancellation.reconciliationRequired) {
        const { error: auditError } = await admin.from("audit_logs").insert({
          actor_id: authUserId,
          action: "ride_payment_cancel_reconciliation_required",
          entity_type: "ride",
          entity_id: rideId,
          metadata: {
            provider: activeCharge.provider,
            payment_row_id: activeCharge.id,
            provider_payment_id: activeCharge.provider_payment_id,
            detail: paymentCancellation.detail,
          },
        });
        if (auditError) console.error("[cancel-ride] reconciliation audit failed", auditError);
      }
    }

    return json({
      ...result,
      payment_charge_cancelled: paymentCancellation?.cancelled ?? true,
      payment_reconciliation_required: paymentCancellation?.reconciliationRequired ?? false,
    }, 200, req);
  } catch (error) {
    console.error("[cancel-ride] fatal", error);
    return json({ ok: false, error_code: "internal_error" }, 500, req);
  }
});
