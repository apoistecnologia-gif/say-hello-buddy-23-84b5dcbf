import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WOOVI_APP_ID = (Deno.env.get("WOOVI_APP_ID") ?? "").trim();
const WOOVI_API_BASE_URL = (Deno.env.get("WOOVI_API_BASE_URL") ?? "https://api.woovi.com").replace(/\/+$/, "");
const PIX_EXPIRES_SECONDS = Math.max(300, Number.parseInt(Deno.env.get("WOOVI_RIDE_PIX_EXPIRES_SECONDS") ?? "900", 10) || 900);

type JsonObject = Record<string, unknown>;
type AdminClient = ReturnType<typeof createClient<any, "public">>;
type ExistingPayment = {
  id: string;
  provider: string;
  provider_payment_id: string | null;
  amount_cents: number;
  status: string;
  pix_payload: string | null;
  pix_expiration_at: string | null;
  pix_qr_code_base64: string | null;
  attempt_number: number;
};

function json(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...(req ? getCorsHeaders(req) : {}), "content-type": "application/json" },
  });
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanAction(value: unknown): "recover" | "retry" {
  return value === "retry" ? "retry" : "recover";
}

function normalizeProviderStatus(value: unknown): string {
  const status = String(value ?? "").trim().toUpperCase();
  if (status === "COMPLETED") return "received";
  if (["EXPIRED", "OVERDUE"].includes(status)) return "expired";
  if (["CANCELLED", "CANCELED"].includes(status)) return "cancelled";
  if (["FAILED", "ERROR"].includes(status)) return "failed";
  return "pending";
}

function parseCharge(payload: unknown): JsonObject | null {
  if (!isObject(payload)) return null;
  if (isObject(payload.charge)) return payload.charge;
  if (isObject(payload.pixQrCode)) return payload.pixQrCode;
  return payload;
}

async function resolvePassenger(admin: AdminClient, authUserId: string) {
  const { data, error } = await admin
    .from("users")
    .select("id,deleted_at")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw new Error(`profile_lookup_failed:${error.message}`);
  return data;
}

async function loadExistingPayment(admin: AdminClient, rideId: string): Promise<ExistingPayment | null> {
  const { data, error } = await admin
    .from("ride_pix_payments")
    .select("id,provider,provider_payment_id,amount_cents,status,pix_payload,pix_expiration_at,pix_qr_code_base64,attempt_number")
    .eq("ride_id", rideId)
    .in("status", ["creating", "pending", "confirmed", "received"])
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`payment_lookup_failed:${error.message}`);
  return (data as ExistingPayment | null) ?? null;
}

function existingResponse(payment: ExistingPayment, req: Request): Response {
  return json({
    ok: true,
    reused: true,
    legacy: payment.provider === "asaas",
    provider: payment.provider,
    paymentId: payment.provider_payment_id,
    amountCents: Number(payment.amount_cents),
    status: payment.status,
    pixPayload: payment.pix_payload,
    pixQrCodeBase64: payment.pix_qr_code_base64,
    pixExpirationAt: payment.pix_expiration_at,
  }, 200, req);
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
  if (authError || !authData.user) return json({ error: "unauthorized" }, 401, req);

  let input: JsonObject;
  try {
    const parsed = await req.json();
    input = isObject(parsed) ? parsed : {};
  } catch {
    return json({ error: "invalid_json" }, 400, req);
  }

  const rideId = typeof input.rideId === "string" ? input.rideId.trim() : "";
  const action = cleanAction(input.action);
  if (!rideId) return json({ error: "ride_id_required" }, 422, req);

  try {
    const passenger = await resolvePassenger(admin, authData.user.id);
    if (!passenger || passenger.deleted_at) return json({ error: "passenger_profile_missing" }, 404, req);

    const { data: ride, error: rideError } = await admin
      .from("rides")
      .select("id,passenger_id,status,payment_method,payment_status,payment_provider,provider_payment_id,estimated_price,processing_fee_cents,passenger_charge_cents")
      .eq("id", rideId)
      .eq("passenger_id", passenger.id)
      .maybeSingle();
    if (rideError) throw new Error(`ride_lookup_failed:${rideError.message}`);
    if (!ride) return json({ error: "ride_not_found" }, 404, req);
    if (String(ride.payment_method ?? "").toLowerCase() !== "pix") {
      return json({ error: "ride_payment_method_not_pix" }, 409, req);
    }
    if (ride.payment_status === "paid") return json({ error: "ride_already_paid" }, 409, req);
    if (ride.status !== "aguardando_pagamento") {
      return json({ error: "ride_not_awaiting_pix_payment" }, 409, req);
    }

    const existingPayment = await loadExistingPayment(admin, rideId);

    if (action === "recover" && existingPayment) {
      // During cutover an already-issued Asaas QR remains valid and must be
      // reused. Creating a second Woovi charge would expose two payable Pix
      // codes for the same ride.
      return existingResponse(existingPayment, req);
    }

    if (action === "retry" && existingPayment?.provider === "asaas") {
      return json({
        error: "legacy_asaas_charge_active",
        provider: "asaas",
        paymentId: existingPayment.provider_payment_id,
        amountCents: Number(existingPayment.amount_cents),
        status: existingPayment.status,
        pixPayload: existingPayment.pix_payload,
        pixQrCodeBase64: existingPayment.pix_qr_code_base64,
        pixExpirationAt: existingPayment.pix_expiration_at,
      }, 409, req);
    }

    // Recovery of a legacy Asaas charge is permitted, but creating a fresh
    // Woovi attempt is not. The database owns the provider switch and stamps
    // each ride with the active provider before checkout.
    if (String(ride.payment_provider ?? "").toLowerCase() !== "woovi") {
      return json({ error: "electronic_payment_provider_not_woovi" }, 409, req);
    }

    if (action === "retry" && existingPayment?.provider === "woovi") {
      const { error: expireError } = await admin
        .from("ride_pix_payments")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", existingPayment.id)
        .eq("provider", "woovi")
        .in("status", ["creating", "pending", "confirmed"]);
      if (expireError) throw new Error(`previous_payment_expire_failed:${expireError.message}`);
    }

    const amountCents = Number(ride.passenger_charge_cents);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
      return json({ error: "invalid_server_payment_amount" }, 500, req);
    }

    const { data: attempts, error: attemptError } = await admin
      .from("ride_pix_payments")
      .select("attempt_number")
      .eq("ride_id", rideId)
      .order("attempt_number", { ascending: false })
      .limit(1);
    if (attemptError) throw new Error(`payment_attempt_lookup_failed:${attemptError.message}`);
    const attemptNumber = Math.max(1, Number(attempts?.[0]?.attempt_number ?? 0) + 1);
    const correlationID = `apois-ride-${rideId}-${attemptNumber}`;

    const { error: reserveError } = await admin.from("ride_pix_payments").insert({
      ride_id: rideId,
      passenger_id: passenger.id,
      driver_id: null,
      provider: "woovi",
      provider_payment_id: correlationID,
      amount_cents: amountCents,
      status: "creating",
      attempt_number: attemptNumber,
      external_reference: correlationID,
    });
    if (reserveError) {
      if (reserveError.code === "23505") {
        const concurrent = await loadExistingPayment(admin, rideId);
        if (concurrent) return existingResponse(concurrent, req);
      }
      throw new Error(`payment_reserve_failed:${reserveError.message}`);
    }

    const response = await fetch(`${WOOVI_API_BASE_URL}/api/v1/charge?return_existing=true`, {
      method: "POST",
      headers: {
        Authorization: WOOVI_APP_ID,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        correlationID,
        value: amountCents,
        type: "DYNAMIC",
        expiresIn: PIX_EXPIRES_SECONDS,
        comment: "APOIS Corridas - pagamento antes do despacho",
        additionalInfo: [
          { key: "rideId", value: rideId },
          { key: "fareCents", value: String(Math.round(Number(ride.estimated_price) * 100)) },
          { key: "processingFeeCents", value: String(Number(ride.processing_fee_cents ?? 0)) },
        ],
      }),
    });

    const rawText = await response.text();
    let providerBody: unknown = null;
    try { providerBody = rawText ? JSON.parse(rawText) : null; } catch { providerBody = null; }

    if (!response.ok) {
      await admin.from("ride_pix_payments").update({
        status: "failed",
        updated_at: new Date().toISOString(),
      }).eq("ride_id", rideId).eq("attempt_number", attemptNumber).eq("provider", "woovi");
      console.error("[woovi-create-ride-pix] provider error", response.status, rawText.slice(0, 500));
      return json({ error: "payment_provider_error" }, 502, req);
    }

    const charge = parseCharge(providerBody);
    const pixPayload = typeof charge?.brCode === "string" ? charge.brCode : null;
    const expiresAt = typeof charge?.expiresDate === "string"
      ? charge.expiresDate
      : new Date(Date.now() + PIX_EXPIRES_SECONDS * 1000).toISOString();
    const providerStatus = normalizeProviderStatus(charge?.status);

    if (!pixPayload) {
      await admin.from("ride_pix_payments").update({
        status: "failed",
        updated_at: new Date().toISOString(),
      }).eq("ride_id", rideId).eq("attempt_number", attemptNumber).eq("provider", "woovi");
      return json({ error: "provider_pix_payload_missing" }, 502, req);
    }

    const { error: persistError } = await admin.from("ride_pix_payments").update({
      provider: "woovi",
      provider_payment_id: correlationID,
      status: providerStatus,
      pix_payload: pixPayload,
      pix_expiration_at: expiresAt,
      updated_at: new Date().toISOString(),
    }).eq("ride_id", rideId).eq("attempt_number", attemptNumber).eq("provider", "woovi");
    if (persistError) throw new Error(`payment_persist_failed:${persistError.message}`);

    const { error: rideUpdateError } = await admin.from("rides").update({
      payment_provider: "woovi",
      provider_payment_id: correlationID,
      updated_at: new Date().toISOString(),
    }).eq("id", rideId).eq("status", "aguardando_pagamento");
    if (rideUpdateError) throw new Error(`ride_payment_link_failed:${rideUpdateError.message}`);

    return json({
      ok: true,
      reused: false,
      legacy: false,
      provider: "woovi",
      paymentId: correlationID,
      amountCents,
      status: providerStatus,
      pixPayload,
      pixQrCodeBase64: null,
      pixExpirationAt: expiresAt,
    }, 200, req);
  } catch (error) {
    console.error("[woovi-create-ride-pix]", error);
    return json({ error: "ride_pix_checkout_failed" }, 500, req);
  }
});
