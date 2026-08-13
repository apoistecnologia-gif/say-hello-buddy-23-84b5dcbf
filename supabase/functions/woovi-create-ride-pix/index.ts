import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WOOVI_APP_ID = (Deno.env.get("WOOVI_APP_ID") ?? "").trim();
const WOOVI_API_BASE_URL = (Deno.env.get("WOOVI_API_BASE_URL") ?? "https://api.woovi.com").replace(/\/+$/, "");
const PIX_EXPIRES_SECONDS = Math.max(300, Number.parseInt(Deno.env.get("WOOVI_RIDE_PIX_EXPIRES_SECONDS") ?? "900", 10) || 900);
const REQUEST_TIMEOUT_MS = 15_000;

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
type RidePaymentContext = {
  id: string;
  estimated_price: number | string;
  processing_fee_cents: number | string | null;
};
type ProviderResult = {
  ok: boolean;
  status: number;
  rawText: string;
  charge: JsonObject | null;
  ambiguous: boolean;
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
  // Provider API completion is not the APOIS source of truth for releasing a
  // ride. Until the authenticated webhook is processed, keep it as confirmed.
  if (status === "COMPLETED") return "confirmed";
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

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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

function providerPayload(correlationID: string, amountCents: number, ride: RidePaymentContext): JsonObject {
  return {
    correlationID,
    value: amountCents,
    type: "DYNAMIC",
    expiresIn: PIX_EXPIRES_SECONDS,
    comment: "APOIS Corridas - pagamento antes do despacho",
    additionalInfo: [
      { key: "rideId", value: ride.id },
      { key: "fareCents", value: String(Math.round(Number(ride.estimated_price) * 100)) },
      { key: "processingFeeCents", value: String(Number(ride.processing_fee_cents ?? 0)) },
    ],
  };
}

async function createOrRecoverProviderCharge(
  correlationID: string,
  amountCents: number,
  ride: RidePaymentContext,
): Promise<ProviderResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${WOOVI_API_BASE_URL}/api/v1/charge?return_existing=true`, {
      method: "POST",
      headers: {
        Authorization: WOOVI_APP_ID,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(providerPayload(correlationID, amountCents, ride)),
      signal: controller.signal,
    });

    const rawText = await response.text();
    let providerBody: unknown = null;
    try { providerBody = rawText ? JSON.parse(rawText) : null; } catch { providerBody = null; }
    const ambiguous = response.status >= 500 || [408, 425, 429].includes(response.status);
    return {
      ok: response.ok,
      status: response.status,
      rawText,
      charge: parseCharge(providerBody),
      ambiguous,
    };
  } catch (error) {
    const detail = error instanceof DOMException && error.name === "AbortError"
      ? "provider_timeout"
      : `provider_transport_unknown:${String(error).slice(0, 300)}`;
    return { ok: false, status: 0, rawText: detail, charge: null, ambiguous: true };
  } finally {
    clearTimeout(timeout);
  }
}

async function persistProviderCharge(
  admin: AdminClient,
  payment: ExistingPayment,
  result: ProviderResult,
): Promise<ExistingPayment | null> {
  const charge = result.charge;
  if (!charge) return null;

  const returnedCorrelationID = cleanText(charge.correlationID);
  if (returnedCorrelationID && payment.provider_payment_id && returnedCorrelationID !== payment.provider_payment_id) {
    return null;
  }

  const returnedValue = charge.value === undefined ? null : Number(charge.value);
  if (returnedValue !== null && (!Number.isFinite(returnedValue) || Math.round(returnedValue) !== Number(payment.amount_cents))) {
    return null;
  }

  const providerStatus = normalizeProviderStatus(charge.status);
  const pixPayload = cleanText(charge.brCode);
  const expiresAt = cleanText(charge.expiresDate) ?? payment.pix_expiration_at ??
    new Date(Date.now() + PIX_EXPIRES_SECONDS * 1000).toISOString();

  const { data, error } = await admin
    .from("ride_pix_payments")
    .update({
      status: providerStatus,
      pix_payload: pixPayload ?? payment.pix_payload,
      pix_expiration_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payment.id)
    .eq("provider", "woovi")
    .select("id,provider,provider_payment_id,amount_cents,status,pix_payload,pix_expiration_at,pix_qr_code_base64,attempt_number")
    .maybeSingle();
  if (error) throw new Error(`payment_persist_failed:${error.message}`);
  return (data as ExistingPayment | null) ?? null;
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

    if (existingPayment?.provider === "asaas") {
      if (action === "retry") {
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
      return existingResponse(existingPayment, req);
    }

    // Recovery is provider-idempotent. If a network/5xx failure happened after
    // Woovi accepted the POST, repeat the SAME correlationID with
    // return_existing=true. Never create a second payable Pix code while the
    // first provider outcome is ambiguous.
    if (existingPayment?.provider === "woovi" && existingPayment.provider_payment_id) {
      if (action === "recover" && existingPayment.pix_payload) {
        return existingResponse(existingPayment, req);
      }

      const recovery = await createOrRecoverProviderCharge(
        existingPayment.provider_payment_id,
        Number(existingPayment.amount_cents),
        ride as RidePaymentContext,
      );

      if (!recovery.ok) {
        if (recovery.ambiguous) {
          return json({
            ok: true,
            pending: true,
            reconciliationRequired: true,
            provider: "woovi",
            paymentId: existingPayment.provider_payment_id,
            amountCents: Number(existingPayment.amount_cents),
            status: existingPayment.status,
          }, 202, req);
        }
        console.error("[woovi-create-ride-pix] recovery rejected", recovery.status, recovery.rawText.slice(0, 500));
        return json({ error: "payment_provider_recovery_failed" }, 502, req);
      }

      const recovered = await persistProviderCharge(admin, existingPayment, recovery);
      if (!recovered) {
        return json({
          ok: true,
          pending: true,
          reconciliationRequired: true,
          error: "provider_charge_mismatch",
          provider: "woovi",
          paymentId: existingPayment.provider_payment_id,
          status: existingPayment.status,
        }, 202, req);
      }

      if (["pending", "confirmed", "received", "creating"].includes(recovered.status)) {
        return existingResponse(recovered, req);
      }

      // Only an explicit provider terminal state authorizes a new attempt.
      // This prevents two live QRs for one ride after a timeout or 5xx.
      if (!["expired", "cancelled", "failed"].includes(recovered.status)) {
        return json({
          ok: true,
          pending: true,
          reconciliationRequired: true,
          provider: "woovi",
          paymentId: recovered.provider_payment_id,
          status: recovered.status,
        }, 202, req);
      }
    }

    // Recovery of a legacy Asaas charge is permitted, but creating a fresh
    // Woovi attempt is not. The database owns the provider switch and stamps
    // each ride with the active provider before checkout.
    if (String(ride.payment_provider ?? "").toLowerCase() !== "woovi") {
      return json({ error: "electronic_payment_provider_not_woovi" }, 409, req);
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

    const { data: reserved, error: reserveError } = await admin.from("ride_pix_payments").insert({
      ride_id: rideId,
      passenger_id: passenger.id,
      driver_id: null,
      provider: "woovi",
      provider_payment_id: correlationID,
      amount_cents: amountCents,
      status: "creating",
      attempt_number: attemptNumber,
      external_reference: correlationID,
    }).select("id,provider,provider_payment_id,amount_cents,status,pix_payload,pix_expiration_at,pix_qr_code_base64,attempt_number").single();
    if (reserveError) {
      if (reserveError.code === "23505") {
        const concurrent = await loadExistingPayment(admin, rideId);
        if (concurrent) return existingResponse(concurrent, req);
      }
      throw new Error(`payment_reserve_failed:${reserveError.message}`);
    }

    const payment = reserved as ExistingPayment;
    const providerResult = await createOrRecoverProviderCharge(
      correlationID,
      amountCents,
      ride as RidePaymentContext,
    );

    if (!providerResult.ok) {
      if (providerResult.ambiguous) {
        // Keep the row in `creating`. A later recover/retry uses the same
        // correlationID, so a provider-side success can be safely recovered.
        console.warn("[woovi-create-ride-pix] ambiguous provider outcome", providerResult.status, providerResult.rawText.slice(0, 500));
        return json({
          ok: true,
          pending: true,
          reconciliationRequired: true,
          provider: "woovi",
          paymentId: correlationID,
          amountCents,
          status: "creating",
        }, 202, req);
      }

      await admin.from("ride_pix_payments").update({
        status: "failed",
        updated_at: new Date().toISOString(),
      }).eq("id", payment.id).eq("provider", "woovi");
      console.error("[woovi-create-ride-pix] provider rejected", providerResult.status, providerResult.rawText.slice(0, 500));
      return json({ error: "payment_provider_error" }, 502, req);
    }

    const persisted = await persistProviderCharge(admin, payment, providerResult);
    if (!persisted) {
      return json({
        ok: true,
        pending: true,
        reconciliationRequired: true,
        error: "provider_charge_mismatch",
        provider: "woovi",
        paymentId: correlationID,
        amountCents,
        status: "creating",
      }, 202, req);
    }

    if (!persisted.pix_payload && !["expired", "cancelled", "failed"].includes(persisted.status)) {
      return json({
        ok: true,
        pending: true,
        reconciliationRequired: true,
        provider: "woovi",
        paymentId: correlationID,
        amountCents,
        status: persisted.status,
      }, 202, req);
    }

    if (["expired", "cancelled", "failed"].includes(persisted.status)) {
      return json({ error: "provider_charge_terminal", status: persisted.status }, 502, req);
    }

    const { error: rideUpdateError } = await admin.from("rides").update({
      payment_provider: "woovi",
      provider_payment_id: correlationID,
      updated_at: new Date().toISOString(),
    }).eq("id", rideId).eq("status", "aguardando_pagamento");
    if (rideUpdateError) throw new Error(`ride_payment_link_failed:${rideUpdateError.message}`);

    return existingResponse(persisted, req);
  } catch (error) {
    console.error("[woovi-create-ride-pix]", error);
    return json({ error: "ride_pix_checkout_failed" }, 500, req);
  }
});