import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { createOpenPixCharge, getOpenPixCharge, openPixBaseUrl } from "../_shared/openpix.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RideRow = {
  id: string;
  passenger_id: string;
  status: string;
  estimated_price: number;
  processing_fee: number;
  passenger_total: number;
  payment_method: string;
  payment_status: string | null;
  payment_provider: string | null;
  provider_payment_id: string | null;
  dispatch_attempts: number;
};

type PixPaymentRow = {
  id: string;
  ride_id: string;
  provider_payment_id: string | null;
  amount_cents: number;
  fare_amount_cents: number;
  processing_fee_cents: number;
  passenger_total_cents: number;
  status: string;
  pix_payload: string | null;
  pix_qr_code_base64: string | null;
  pix_expiration_at: string | null;
  attempt_number: number;
  external_reference: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function cents(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("invalid_money_value");
  return Math.round(parsed * 100);
}

function onlyDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function openPixEnvironment(): "sandbox" | "production" {
  return openPixBaseUrl().includes("woovi-sandbox") ? "sandbox" : "production";
}

async function dispatchIfNeeded(rideId: string): Promise<void> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/passenger-ride-request`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
      "content-type": "application/json",
    },
    body: JSON.stringify({ action: "dispatch_paid_pix", ride_id: rideId }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`paid_pix_dispatch_failed:${response.status}:${detail.slice(0, 200)}`);
  }
}

async function loadPayment(admin: ReturnType<typeof createClient>, rideId: string): Promise<PixPaymentRow | null> {
  const { data, error } = await admin
    .from("ride_pix_payments")
    .select("id,ride_id,provider_payment_id,amount_cents,fare_amount_cents,processing_fee_cents,passenger_total_cents,status,pix_payload,pix_qr_code_base64,pix_expiration_at,attempt_number,external_reference")
    .eq("ride_id", rideId)
    .eq("provider", "openpix")
    .in("status", ["creating", "pending", "confirmed", "received"])
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as PixPaymentRow | null) ?? null;
}

function responseFor(payment: PixPaymentRow, ride: RideRow, reused: boolean, imageUrl?: string | null) {
  return {
    ok: true,
    reused,
    provider: "openpix",
    environment: openPixEnvironment(),
    paymentId: payment.provider_payment_id,
    correlationID: payment.external_reference,
    fareAmountCents: payment.fare_amount_cents,
    processingFeeCents: payment.processing_fee_cents,
    amountCents: payment.passenger_total_cents,
    status: payment.status,
    rideStatus: ride.status,
    paymentStatus: ride.payment_status,
    paid: ride.payment_status === "paid",
    pixPayload: payment.pix_payload,
    pixQrCodeBase64: payment.pix_qr_code_base64,
    pixQrCodeImageUrl: imageUrl ?? payment.pix_qr_code_base64,
    pixExpirationAt: payment.pix_expiration_at,
    attemptNumber: payment.attempt_number,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    if (!Deno.env.get("OPENPIX_APP_ID")?.trim()) {
      return json({ error: "openpix_not_configured", environment: openPixEnvironment() }, 503);
    }

    const authorization = req.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authResult, error: authError } = await userClient.auth.getUser();
    if (authError || !authResult.user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: profile } = await admin
      .from("users")
      .select("id,name,email,phone,cpf")
      .eq("auth_user_id", authResult.user.id)
      .maybeSingle();
    if (!profile) return json({ error: "profile_missing" }, 404);

    let body: { rideId?: string; action?: string } = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const rideId = String(body.rideId ?? "").trim();
    const action = body.action === "retry" ? "retry" : "recover";
    if (!rideId) return json({ error: "ride_id_required" }, 422);

    const { data: rideData, error: rideError } = await admin
      .from("rides")
      .select("id,passenger_id,status,estimated_price,processing_fee,passenger_total,payment_method,payment_status,payment_provider,provider_payment_id,dispatch_attempts")
      .eq("id", rideId)
      .maybeSingle();
    if (rideError || !rideData) return json({ error: "ride_not_found" }, 404);
    const ride = rideData as RideRow;

    if (ride.passenger_id !== profile.id) return json({ error: "forbidden" }, 403);
    if (String(ride.payment_method).toLowerCase() !== "pix") {
      return json({ error: "ride_payment_method_not_pix" }, 409);
    }

    if (ride.payment_status === "paid") {
      if (ride.status === "procurar_motorista" && Number(ride.dispatch_attempts ?? 0) === 0) {
        try {
          await dispatchIfNeeded(ride.id);
        } catch (error) {
          console.error("[openpix-create-ride-pix] paid dispatch recovery", error);
        }
      }
      const payment = await loadPayment(admin, ride.id);
      if (!payment) {
        return json({
          ok: true,
          reused: true,
          paid: true,
          provider: "openpix",
          paymentId: ride.provider_payment_id,
          fareAmountCents: cents(ride.estimated_price),
          processingFeeCents: cents(ride.processing_fee),
          amountCents: cents(ride.passenger_total),
          rideStatus: ride.status,
          paymentStatus: ride.payment_status,
        });
      }
      return json(responseFor(payment, ride, true));
    }

    if (ride.status !== "aguardando_pagamento") {
      return json({ error: "ride_not_awaiting_pix_payment", rideStatus: ride.status }, 409);
    }

    const fareAmountCents = cents(ride.estimated_price);
    const processingFeeCents = cents(ride.processing_fee);
    const passengerTotalCents = cents(ride.passenger_total);
    if (fareAmountCents <= 0 || passengerTotalCents <= 0) return json({ error: "invalid_ride_amount" }, 422);
    if (passengerTotalCents !== fareAmountCents + processingFeeCents) {
      return json({ error: "ride_payment_breakdown_mismatch" }, 409);
    }

    let active = await loadPayment(admin, ride.id);
    if (active?.status === "received") {
      return json(responseFor(active, ride, true));
    }

    if (active && active.passenger_total_cents !== passengerTotalCents) {
      if (action !== "retry") return json({ error: "pix_attempt_amount_mismatch" }, 409);
      await admin
        .from("ride_pix_payments")
        .update({ status: "superseded", updated_at: new Date().toISOString() })
        .eq("id", active.id)
        .in("status", ["creating", "pending", "confirmed"]);
      active = null;
    }

    if (!active) {
      const { data: lastAttempt } = await admin
        .from("ride_pix_payments")
        .select("attempt_number")
        .eq("ride_id", ride.id)
        .order("attempt_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      const attemptNumber = Number(lastAttempt?.attempt_number ?? 0) + 1;
      const correlationID = `apois-ride-${ride.id}-attempt-${attemptNumber}`;
      const { data: reserved, error: reserveError } = await admin
        .from("ride_pix_payments")
        .insert({
          ride_id: ride.id,
          passenger_id: profile.id,
          driver_id: null,
          provider: "openpix",
          provider_payment_id: null,
          amount_cents: passengerTotalCents,
          fare_amount_cents: fareAmountCents,
          processing_fee_cents: processingFeeCents,
          passenger_total_cents: passengerTotalCents,
          status: "creating",
          attempt_number: attemptNumber,
          external_reference: correlationID,
          updated_at: new Date().toISOString(),
        })
        .select("id,ride_id,provider_payment_id,amount_cents,fare_amount_cents,processing_fee_cents,passenger_total_cents,status,pix_payload,pix_qr_code_base64,pix_expiration_at,attempt_number,external_reference")
        .single();
      if (reserveError) throw reserveError;
      active = reserved as PixPaymentRow;
    }

    if (!active.external_reference) throw new Error("openpix_correlation_id_missing");

    let charge = null;
    try {
      charge = await getOpenPixCharge(active.external_reference);
    } catch (error) {
      if (!String(error).includes("openpix_http_404")) {
        console.warn("[openpix-create-ride-pix] charge recovery", String(error));
      }
    }

    if (!charge) {
      const cpf = onlyDigits(profile.cpf);
      charge = await createOpenPixCharge({
        correlationID: active.external_reference,
        valueCents: passengerTotalCents,
        comment: `Corrida APOIS ${ride.id.slice(0, 8)}`,
        customer: profile.name?.trim()
          ? {
              name: profile.name.trim(),
              taxID: cpf.length === 11 ? cpf : null,
              email: profile.email?.trim() || null,
              phone: onlyDigits(profile.phone) || null,
            }
          : undefined,
      });
    }

    const providerId = String(charge.identifier ?? charge.correlationID ?? active.external_reference).trim();
    const providerValue = Number(charge.value ?? 0);
    if (providerValue > 0 && providerValue !== passengerTotalCents) {
      throw new Error(`openpix_charge_amount_mismatch:${providerValue}:${passengerTotalCents}`);
    }

    const expiresAt = typeof charge.expiresDate === "string" ? charge.expiresDate : null;
    const pixPayload = String(charge.brCode ?? "").trim() || null;
    const qrCodeImage = String(charge.qrCodeImage ?? "").trim() || null;

    const { data: saved, error: saveError } = await admin
      .from("ride_pix_payments")
      .update({
        provider_payment_id: providerId,
        status: "pending",
        pix_payload: pixPayload,
        pix_qr_code_base64: qrCodeImage,
        pix_expiration_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", active.id)
      .in("status", ["creating", "pending"])
      .select("id,ride_id,provider_payment_id,amount_cents,fare_amount_cents,processing_fee_cents,passenger_total_cents,status,pix_payload,pix_qr_code_base64,pix_expiration_at,attempt_number,external_reference")
      .single();
    if (saveError) throw saveError;

    await admin
      .from("rides")
      .update({
        payment_provider: "openpix",
        provider_payment_id: providerId,
        payment_status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", ride.id)
      .eq("status", "aguardando_pagamento");

    return json(responseFor(saved as PixPaymentRow, ride, false, qrCodeImage));
  } catch (error) {
    console.error("[openpix-create-ride-pix]", error);
    return json(
      {
        error: "openpix_ride_pix_failed",
        environment: openPixEnvironment(),
        detail: String(error).slice(0, 500),
      },
      502,
    );
  }
});
