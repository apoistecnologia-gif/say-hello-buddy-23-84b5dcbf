import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  PAGBANK_ENVIRONMENT,
  onlyDigits,
  pagbankConfigured,
  pagbankFetch,
  pagbankFetchText,
} from "../_shared/pagbank.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const WEBHOOK_URL = (Deno.env.get("PAGBANK_WEBHOOK_URL")?.trim() || `${SUPABASE_URL}/functions/v1/pagbank-webhook`);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RideRow = {
  id: string;
  passenger_id: string;
  status: string;
  estimated_price: number | string;
  payment_method: string;
  payment_status: string | null;
  payment_provider: string | null;
  provider_payment_id: string | null;
  dispatch_attempts: number | null;
  fare_amount_cents: number | string | null;
  processing_fee_cents: number | string | null;
  passenger_charge_cents: number | string | null;
};

type PixRow = {
  id: string;
  ride_id: string;
  provider: string;
  provider_payment_id: string | null;
  amount_cents: number;
  status: string;
  pix_payload: string | null;
  pix_qr_code_base64: string | null;
  pix_expiration_at: string | null;
  attempt_number: number;
  external_reference: string | null;
};

type PagBankOrder = {
  id?: string;
  reference_id?: string;
  qr_codes?: Array<{
    id?: string;
    expiration_date?: string;
    amount?: { value?: number };
    text?: string;
    links?: Array<{ rel?: string; href?: string; media?: string; type?: string }>;
  }>;
  charges?: Array<{
    id?: string;
    status?: string;
    amount?: { value?: number; summary?: { total?: number; paid?: number; refunded?: number } };
    payment_method?: { type?: string; pix?: { end_to_end_id?: string } };
  }>;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function expectedChargeCents(ride: RideRow): number {
  const total = Number(ride.passenger_charge_cents);
  if (Number.isSafeInteger(total) && total > 0) {
    const fare = Number(ride.fare_amount_cents);
    const fee = Number(ride.processing_fee_cents);
    if (!Number.isSafeInteger(fare) || fare <= 0 || !Number.isSafeInteger(fee) || fee < 0 || total !== fare + fee) {
      throw new Error("invalid_ride_financial_snapshot");
    }
    return total;
  }
  const legacy = Math.round(Number(ride.estimated_price) * 100);
  if (!Number.isSafeInteger(legacy) || legacy <= 0) throw new Error("invalid_ride_amount");
  return legacy;
}

function parsePhone(value: unknown) {
  const digits = onlyDigits(value);
  if (digits.length !== 10 && digits.length !== 11) return null;
  return { country: "55", area: digits.slice(0, 2), number: digits.slice(2), type: "MOBILE" };
}

function pickQr(order: PagBankOrder) {
  return Array.isArray(order.qr_codes) ? order.qr_codes[0] ?? null : null;
}

function base64Link(order: PagBankOrder): string | null {
  const qr = pickQr(order);
  const link = qr?.links?.find((item) => item.rel === "QRCODE.BASE64" || item.media === "text/plain");
  return typeof link?.href === "string" && link.href.startsWith("https://") ? link.href : null;
}

async function loadActivePayment(admin: ReturnType<typeof createClient>, rideId: string): Promise<PixRow | null> {
  const { data, error } = await admin
    .from("ride_pix_payments")
    .select("id,ride_id,provider,provider_payment_id,amount_cents,status,pix_payload,pix_qr_code_base64,pix_expiration_at,attempt_number,external_reference")
    .eq("ride_id", rideId)
    .in("status", ["creating", "pending", "confirmed"])
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as PixRow | null) ?? null;
}

function responseFor(payment: PixRow, ride: RideRow, reused: boolean) {
  return {
    ok: true,
    reused,
    provider: "pagbank",
    environment: PAGBANK_ENVIRONMENT,
    paymentId: payment.provider_payment_id,
    amountCents: payment.amount_cents,
    status: payment.status,
    rideStatus: ride.status,
    paymentStatus: ride.payment_status ?? "pending",
    paid: ride.payment_status === "paid",
    pixPayload: payment.pix_payload,
    pixQrCodeBase64: payment.pix_qr_code_base64,
    pixExpirationAt: payment.pix_expiration_at,
    attemptNumber: payment.attempt_number,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    if (!pagbankConfigured()) return json({ error: "pagbank_not_configured", environment: PAGBANK_ENVIRONMENT }, 503);

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

    let body: { rideId?: string } = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const rideId = String(body.rideId ?? "").trim();
    if (!rideId) return json({ error: "ride_id_required" }, 422);

    const { data: profile } = await admin
      .from("users")
      .select("id,name,email,phone,cpf")
      .eq("auth_user_id", authResult.user.id)
      .maybeSingle();
    if (!profile) return json({ error: "profile_missing" }, 404);

    const { data: rideData, error: rideError } = await admin
      .from("rides")
      .select("id,passenger_id,status,estimated_price,payment_method,payment_status,payment_provider,provider_payment_id,dispatch_attempts,fare_amount_cents,processing_fee_cents,passenger_charge_cents")
      .eq("id", rideId)
      .maybeSingle();
    if (rideError || !rideData) return json({ error: "ride_not_found" }, 404);
    const ride = rideData as RideRow;

    if (ride.passenger_id !== profile.id) return json({ error: "forbidden" }, 403);
    if (String(ride.payment_method).toLowerCase() !== "pix") return json({ error: "ride_payment_method_not_pix" }, 409);
    if (String(ride.payment_provider ?? "").toLowerCase() !== "pagbank") {
      return json({ error: "ride_payment_provider_mismatch", provider: ride.payment_provider }, 409);
    }
    if (ride.payment_status === "paid") {
      const paid = await admin
        .from("ride_pix_payments")
        .select("id,ride_id,provider,provider_payment_id,amount_cents,status,pix_payload,pix_qr_code_base64,pix_expiration_at,attempt_number,external_reference")
        .eq("ride_id", ride.id)
        .eq("provider", "pagbank")
        .eq("provider_payment_id", ride.provider_payment_id)
        .maybeSingle();
      if (paid.error) throw paid.error;
      if (!paid.data) return json({ error: "paid_pix_receipt_missing" }, 409);
      return json(responseFor(paid.data as PixRow, ride, true));
    }
    if (ride.status !== "aguardando_pagamento") {
      return json({ error: "ride_not_awaiting_pix_payment", rideStatus: ride.status }, 409);
    }

    const amountCents = expectedChargeCents(ride);
    let active = await loadActivePayment(admin, ride.id);
    if (active && active.provider !== "pagbank") {
      return json({ error: "ride_has_active_payment_other_provider", provider: active.provider }, 409);
    }
    if (active && Number(active.amount_cents) !== amountCents) {
      throw new Error(`pix_attempt_amount_mismatch:${active.amount_cents}:${amountCents}`);
    }

    if (active?.provider_payment_id) {
      try {
        const order = await pagbankFetch<PagBankOrder>(`/orders/${encodeURIComponent(active.provider_payment_id)}`, { method: "GET" });
        const qr = pickQr(order);
        if (qr && Number(qr.amount?.value) === amountCents) {
          let qrBase64 = active.pix_qr_code_base64;
          const qrBase64Url = base64Link(order);
          if (!qrBase64 && qrBase64Url) {
            try { qrBase64 = (await pagbankFetchText(qrBase64Url)).trim() || null; } catch (error) { console.warn("[pagbank-create-ride-pix] qr base64 recovery", error); }
          }
          const { data: refreshed, error: refreshError } = await admin
            .from("ride_pix_payments")
            .update({
              pix_payload: qr.text ?? active.pix_payload,
              pix_qr_code_base64: qrBase64,
              pix_expiration_at: qr.expiration_date ?? active.pix_expiration_at,
              status: "pending",
              updated_at: new Date().toISOString(),
            })
            .eq("id", active.id)
            .select("id,ride_id,provider,provider_payment_id,amount_cents,status,pix_payload,pix_qr_code_base64,pix_expiration_at,attempt_number,external_reference")
            .single();
          if (refreshError) throw refreshError;
          return json(responseFor(refreshed as PixRow, ride, true));
        }
      } catch (error) {
        console.warn("[pagbank-create-ride-pix] order recovery", error);
      }
    }

    const cpf = onlyDigits(profile.cpf);
    const email = String(profile.email ?? authResult.user.email ?? "").trim();
    const name = String(profile.name ?? "").trim();
    if (!name || cpf.length !== 11 || !email.includes("@")) {
      return json({
        error: "passenger_billing_identity_incomplete",
        missing: [...(!name ? ["name"] : []), ...(cpf.length !== 11 ? ["cpf"] : []), ...(!email.includes("@") ? ["email"] : [])],
      }, 422);
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
      const externalReference = `apois-ride-${ride.id}-attempt-${attemptNumber}`;
      const { data: reserved, error: reserveError } = await admin
        .from("ride_pix_payments")
        .insert({
          ride_id: ride.id,
          passenger_id: profile.id,
          driver_id: null,
          provider: "pagbank",
          provider_payment_id: null,
          amount_cents: amountCents,
          status: "creating",
          attempt_number: attemptNumber,
          external_reference: externalReference,
          updated_at: new Date().toISOString(),
        })
        .select("id,ride_id,provider,provider_payment_id,amount_cents,status,pix_payload,pix_qr_code_base64,pix_expiration_at,attempt_number,external_reference")
        .single();
      if (reserveError) {
        active = await loadActivePayment(admin, ride.id);
        if (!active || active.provider !== "pagbank") throw reserveError;
      } else {
        active = reserved as PixRow;
      }
    }

    if (!active?.external_reference) throw new Error("pix_attempt_reservation_failed");
    const phone = parsePhone(profile.phone);
    const expirationDate = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const orderPayload = {
      reference_id: active.external_reference,
      customer: {
        name,
        email,
        tax_id: cpf,
        ...(phone ? { phones: [phone] } : {}),
      },
      items: [{
        reference_id: `ride-${ride.id}`,
        name: "Corrida APOIS",
        quantity: 1,
        unit_amount: amountCents,
      }],
      qr_codes: [{ amount: { value: amountCents }, expiration_date: expirationDate }],
      notification_urls: [WEBHOOK_URL],
    };

    const idempotencyKey = `apois${active.id.replace(/-/g, "")}`;
    const order = await pagbankFetch<PagBankOrder>("/orders", {
      method: "POST",
      headers: { "x-idempotency-key": idempotencyKey },
      body: JSON.stringify(orderPayload),
    });
    const orderId = String(order.id ?? "").trim();
    const qr = pickQr(order);
    if (!orderId.startsWith("ORDE_") || !qr?.text || Number(qr.amount?.value) !== amountCents) {
      throw new Error("pagbank_invalid_pix_order_response");
    }
    if (order.reference_id && order.reference_id !== active.external_reference) {
      throw new Error("pagbank_reference_mismatch");
    }

    let qrBase64: string | null = null;
    const qrBase64Url = base64Link(order);
    if (qrBase64Url) {
      try { qrBase64 = (await pagbankFetchText(qrBase64Url)).trim() || null; } catch (error) { console.warn("[pagbank-create-ride-pix] qr base64", error); }
    }

    const nowIso = new Date().toISOString();
    const { data: saved, error: saveError } = await admin
      .from("ride_pix_payments")
      .update({
        provider_payment_id: orderId,
        status: "pending",
        pix_payload: qr.text,
        pix_qr_code_base64: qrBase64,
        pix_expiration_at: qr.expiration_date ?? expirationDate,
        updated_at: nowIso,
      })
      .eq("id", active.id)
      .eq("provider", "pagbank")
      .in("status", ["creating", "pending"])
      .select("id,ride_id,provider,provider_payment_id,amount_cents,status,pix_payload,pix_qr_code_base64,pix_expiration_at,attempt_number,external_reference")
      .single();
    if (saveError) throw saveError;

    const { error: rideUpdateError } = await admin
      .from("rides")
      .update({ provider_payment_id: orderId, payment_status: "pending", updated_at: nowIso })
      .eq("id", ride.id)
      .eq("payment_provider", "pagbank")
      .eq("status", "aguardando_pagamento")
      .neq("payment_status", "paid");
    if (rideUpdateError) throw rideUpdateError;

    return json(responseFor(saved as PixRow, { ...ride, provider_payment_id: orderId, payment_status: "pending" }, false));
  } catch (error) {
    console.error("[pagbank-create-ride-pix]", error);
    return json({
      error: "pagbank_ride_pix_failed",
      environment: PAGBANK_ENVIRONMENT,
      detail: String(error).slice(0, 800),
    }, 502);
  }
});