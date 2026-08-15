import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  ASAAS_ENVIRONMENT,
  type AsaasPixQr,
  asaasConfigured,
  asaasFetch,
  onlyDigits,
} from "../_shared/asaas.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PixPaymentRow = {
  id: string;
  ride_id: string;
  provider_payment_id: string | null;
  amount_cents: number;
  status: string;
  pix_payload: string | null;
  pix_qr_code_base64: string | null;
  pix_expiration_at: string | null;
  attempt_number: number;
  external_reference: string | null;
};

type RideRow = {
  id: string;
  passenger_id: string;
  driver_id: string | null;
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

type ProviderPayment = { id?: string; status?: string; value?: number; netValue?: number };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function expiredAt(value: string | null | undefined): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function expectedPassengerChargeCents(ride: RideRow): number {
  const snapshot = Number(ride.passenger_charge_cents);
  if (Number.isSafeInteger(snapshot) && snapshot > 0) {
    const fareCents = Number(ride.fare_amount_cents);
    const processingFeeCents = Number(ride.processing_fee_cents);
    if (!Number.isSafeInteger(fareCents) || fareCents <= 0 || !Number.isSafeInteger(processingFeeCents) || processingFeeCents < 0) {
      throw new Error("invalid_ride_financial_snapshot");
    }
    if (snapshot !== fareCents + processingFeeCents) {
      throw new Error("invalid_ride_financial_snapshot");
    }
    return snapshot;
  }

  const legacy = Math.round(Number(ride.estimated_price) * 100);
  if (!Number.isSafeInteger(legacy) || legacy <= 0) throw new Error("invalid_ride_amount");
  return legacy;
}

function centsToBrl(cents: number): number {
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error("invalid_ride_amount");
  return Number((cents / 100).toFixed(2));
}

async function dispatchIfNeeded(rideId: string) {
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

async function loadActivePayment(admin: ReturnType<typeof createClient>, rideId: string): Promise<PixPaymentRow | null> {
  const { data, error } = await admin
    .from("ride_pix_payments")
    .select("id,ride_id,provider_payment_id,amount_cents,status,pix_payload,pix_qr_code_base64,pix_expiration_at,attempt_number,external_reference")
    .eq("ride_id", rideId)
    .in("status", ["creating", "pending", "confirmed"])
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as PixPaymentRow | null) ?? null;
}

async function recoverAsaasPaymentByReference(reference: string) {
  const listed = await asaasFetch<{ data?: Array<{ id?: string }> }>(
    `/payments?externalReference=${encodeURIComponent(reference)}&limit=1`,
    { method: "GET" },
  );
  const id = String(listed.data?.[0]?.id ?? "").trim();
  return id ? { id } : null;
}

async function hydratePix(admin: ReturnType<typeof createClient>, payment: PixPaymentRow): Promise<PixPaymentRow> {
  if (!payment.provider_payment_id) return payment;
  if (payment.pix_payload && payment.pix_qr_code_base64) return payment;
  const pix = await asaasFetch<AsaasPixQr>(
    `/payments/${encodeURIComponent(payment.provider_payment_id)}/pixQrCode`,
    { method: "GET" },
  );
  const update = {
    pix_payload: pix.payload ?? payment.pix_payload,
    pix_qr_code_base64: pix.encodedImage ?? payment.pix_qr_code_base64,
    pix_expiration_at: pix.expirationDate ?? payment.pix_expiration_at,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await admin
    .from("ride_pix_payments")
    .update(update)
    .eq("id", payment.id)
    .select("id,ride_id,provider_payment_id,amount_cents,status,pix_payload,pix_qr_code_base64,pix_expiration_at,attempt_number,external_reference")
    .single();
  if (error) throw error;
  return data as PixPaymentRow;
}

function responseFor(payment: PixPaymentRow, rideStatus: string, paymentStatus: string | null, reused: boolean) {
  return {
    ok: true,
    reused,
    provider: "asaas",
    environment: ASAAS_ENVIRONMENT,
    paymentId: payment.provider_payment_id,
    amountCents: payment.amount_cents,
    status: payment.status,
    rideStatus,
    paymentStatus,
    paid: paymentStatus === "paid",
    pixPayload: payment.pix_payload,
    pixQrCodeBase64: payment.pix_qr_code_base64,
    pixExpirationAt: payment.pix_expiration_at,
    attemptNumber: payment.attempt_number,
  };
}

async function reconcileProviderPayment(
  admin: ReturnType<typeof createClient>,
  payment: PixPaymentRow,
  ride: { id: string },
) {
  if (!payment.provider_payment_id) return null;
  const provider = await asaasFetch<ProviderPayment>(
    `/payments/${encodeURIComponent(payment.provider_payment_id)}`,
    { method: "GET" },
  );
  const providerStatus = String(provider.status ?? "").trim().toUpperCase();
  if (providerStatus !== "RECEIVED") return null;

  const grossCents = Math.round(Number(provider.value ?? 0) * 100);
  if (grossCents <= 0 || grossCents !== Number(payment.amount_cents)) {
    throw new Error(`asaas_ride_payment_amount_mismatch:${grossCents}:${payment.amount_cents}`);
  }
  const netCents = Math.max(0, Math.round(Number(provider.netValue ?? provider.value ?? 0) * 100));
  const feeCents = Math.max(0, grossCents - netCents);
  const nowIso = new Date().toISOString();

  const { data: received, error: updateError } = await admin
    .from("ride_pix_payments")
    .update({
      status: "received",
      paid_at: nowIso,
      provider_net_amount_cents: netCents,
      provider_fee_cents: feeCents,
      updated_at: nowIso,
    })
    .eq("id", payment.id)
    .select("id,ride_id,provider_payment_id,amount_cents,status,pix_payload,pix_qr_code_base64,pix_expiration_at,attempt_number,external_reference")
    .single();
  if (updateError) throw updateError;

  const { data: activation, error: activationError } = await admin.rpc("activate_prepaid_pix_ride", {
    _ride_id: payment.ride_id,
    _provider_payment_id: payment.provider_payment_id,
  });
  if (activationError) throw activationError;
  if (activation?.should_dispatch) await dispatchIfNeeded(payment.ride_id);

  const { data: refreshedRide, error: refreshedRideError } = await admin
    .from("rides")
    .select("id,status,payment_status,dispatch_attempts")
    .eq("id", ride.id)
    .single();
  if (refreshedRideError) throw refreshedRideError;
  return responseFor(received as PixPaymentRow, refreshedRide.status, refreshedRide.payment_status, true);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    if (!asaasConfigured()) return json({ error: "asaas_not_configured", environment: ASAAS_ENVIRONMENT }, 503);

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
      .select("id,passenger_id,driver_id,status,estimated_price,payment_method,payment_status,payment_provider,provider_payment_id,dispatch_attempts,fare_amount_cents,processing_fee_cents,passenger_charge_cents")
      .eq("id", rideId)
      .maybeSingle();
    if (rideError || !rideData) return json({ error: "ride_not_found" }, 404);
    const ride = rideData as RideRow;

    if (ride.passenger_id !== profile.id) return json({ error: "forbidden" }, 403);
    if (String(ride.payment_method).toLowerCase() !== "pix") return json({ error: "ride_payment_method_not_pix" }, 409);
    if (ride.payment_provider && String(ride.payment_provider).toLowerCase() !== "asaas") {
      return json({ error: "ride_payment_provider_mismatch" }, 409);
    }

    const amountCents = expectedPassengerChargeCents(ride);
    const amount = centsToBrl(amountCents);

    if (ride.payment_status === "paid") {
      if (ride.status === "procurar_motorista" && Number(ride.dispatch_attempts ?? 0) === 0) {
        try {
          await dispatchIfNeeded(ride.id);
        } catch (error) {
          console.error("[asaas-create-ride-pix] paid dispatch recovery", error);
        }
      }
      const { data: received } = await admin
        .from("ride_pix_payments")
        .select("id,ride_id,provider_payment_id,amount_cents,status,pix_payload,pix_qr_code_base64,pix_expiration_at,attempt_number,external_reference")
        .eq("ride_id", ride.id)
        .eq("provider_payment_id", ride.provider_payment_id)
        .maybeSingle();
      return json({
        ok: true,
        reused: true,
        provider: "asaas",
        paid: true,
        status: "received",
        paymentId: ride.provider_payment_id,
        amountCents: received?.amount_cents ?? amountCents,
        rideStatus: ride.status,
        paymentStatus: ride.payment_status,
        pixPayload: received?.pix_payload ?? null,
        pixQrCodeBase64: received?.pix_qr_code_base64 ?? null,
        pixExpirationAt: received?.pix_expiration_at ?? null,
        attemptNumber: received?.attempt_number ?? null,
      });
    }

    if (ride.status !== "aguardando_pagamento") {
      return json({ error: "ride_not_awaiting_pix_payment", rideStatus: ride.status }, 409);
    }

    let active = await loadActivePayment(admin, ride.id);
    if (active && Number(active.amount_cents) !== amountCents) {
      throw new Error(`pix_attempt_amount_mismatch:${active.amount_cents}:${amountCents}`);
    }

    if (active?.provider_payment_id) {
      const reconciled = await reconcileProviderPayment(admin, active, ride);
      if (reconciled) return json(reconciled);
    }

    if (active && ["pending", "confirmed"].includes(active.status) && expiredAt(active.pix_expiration_at)) {
      const expiredPayment: PixPaymentRow = { ...active, status: "expired" };
      await admin
        .from("ride_pix_payments")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", active.id)
        .in("status", ["pending", "confirmed"]);
      await admin
        .from("rides")
        .update({ payment_status: "expired", provider_payment_id: null, updated_at: new Date().toISOString() })
        .eq("id", ride.id)
        .eq("status", "aguardando_pagamento")
        .neq("payment_status", "paid");
      if (action !== "retry") return json(responseFor(expiredPayment, ride.status, "expired", true));
      active = null;
    }

    if (active?.status === "creating" && active.external_reference && !active.provider_payment_id) {
      const recovered = await recoverAsaasPaymentByReference(active.external_reference);
      if (recovered?.id) {
        const { error } = await admin
          .from("ride_pix_payments")
          .update({ provider_payment_id: recovered.id, status: "pending", updated_at: new Date().toISOString() })
          .eq("id", active.id)
          .eq("status", "creating");
        if (error) throw error;
        await admin
          .from("rides")
          .update({ provider_payment_id: recovered.id, payment_status: "pending", updated_at: new Date().toISOString() })
          .eq("id", ride.id)
          .eq("status", "aguardando_pagamento");
        active = await loadActivePayment(admin, ride.id);
        if (active?.provider_payment_id) {
          const reconciled = await reconcileProviderPayment(admin, active, ride);
          if (reconciled) return json(reconciled);
        }
      }
    }

    if (active?.provider_payment_id) {
      const hydrated = await hydratePix(admin, active);
      return json(responseFor(hydrated, ride.status, ride.payment_status ?? "pending", true));
    }

    const cpfCnpj = onlyDigits(profile.cpf);
    if (!profile.name?.trim() || cpfCnpj.length !== 11) {
      return json({
        error: "passenger_billing_identity_incomplete",
        missing: [
          ...(!profile.name?.trim() ? ["name"] : []),
          ...(cpfCnpj.length !== 11 ? ["cpf"] : []),
        ],
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
          provider: "asaas",
          provider_payment_id: null,
          amount_cents: amountCents,
          status: "creating",
          attempt_number: attemptNumber,
          external_reference: externalReference,
          updated_at: new Date().toISOString(),
        })
        .select("id,ride_id,provider_payment_id,amount_cents,status,pix_payload,pix_qr_code_base64,pix_expiration_at,attempt_number,external_reference")
        .maybeSingle();
      if (reserveError) {
        active = await loadActivePayment(admin, ride.id);
        if (!active) throw reserveError;
      } else {
        active = reserved as PixPaymentRow;
      }
    }

    if (!active) throw new Error("pix_attempt_reservation_failed");
    if (Number(active.amount_cents) !== amountCents) throw new Error("pix_attempt_amount_mismatch");
    if (!active.external_reference) throw new Error("pix_external_reference_missing");

    let providerId = active.provider_payment_id;
    if (!providerId) {
      const recovered = await recoverAsaasPaymentByReference(active.external_reference);
      providerId = recovered?.id ?? null;
    }

    if (!providerId) {
      const customerReference = `apois-passenger-${profile.id}`;
      const listed = await asaasFetch<{ data?: Array<{ id: string }> }>(
        `/customers?externalReference=${encodeURIComponent(customerReference)}&limit=1`,
        { method: "GET" },
      );
      let customerId = listed.data?.[0]?.id ?? null;
      if (!customerId) {
        const customer = await asaasFetch<{ id: string }>("/customers", {
          method: "POST",
          body: JSON.stringify({
            name: profile.name.trim(),
            cpfCnpj,
            email: profile.email?.trim() || undefined,
            mobilePhone: onlyDigits(profile.phone) || undefined,
            externalReference: customerReference,
            notificationDisabled: false,
          }),
        });
        customerId = customer.id;
      }
      const created = await asaasFetch<{ id: string }>("/payments", {
        method: "POST",
        body: JSON.stringify({
          customer: customerId,
          billingType: "PIX",
          value: amount,
          dueDate: new Date().toISOString().slice(0, 10),
          description: `Corrida APOIS ${ride.id.slice(0, 8)}`,
          externalReference: active.external_reference,
        }),
      });
      providerId = String(created.id ?? "").trim();
      if (!providerId) throw new Error("asaas_payment_id_missing");
    }

    const pix = await asaasFetch<AsaasPixQr>(
      `/payments/${encodeURIComponent(providerId)}/pixQrCode`,
      { method: "GET" },
    );
    const { data: saved, error: saveError } = await admin
      .from("ride_pix_payments")
      .update({
        provider_payment_id: providerId,
        status: "pending",
        pix_payload: pix.payload ?? null,
        pix_qr_code_base64: pix.encodedImage ?? null,
        pix_expiration_at: pix.expirationDate ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", active.id)
      .in("status", ["creating", "pending"])
      .select("id,ride_id,provider_payment_id,amount_cents,status,pix_payload,pix_qr_code_base64,pix_expiration_at,attempt_number,external_reference")
      .single();
    if (saveError) throw saveError;

    await admin
      .from("rides")
      .update({
        payment_provider: "asaas",
        provider_payment_id: providerId,
        payment_status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", ride.id)
      .eq("status", "aguardando_pagamento");

    return json(responseFor(saved as PixPaymentRow, ride.status, "pending", false));
  } catch (error) {
    console.error("[asaas-create-ride-pix]", error);
    return json({
      error: "asaas_ride_pix_failed",
      environment: ASAAS_ENVIRONMENT,
      detail: String(error).slice(0, 500),
    }, 502);
  }
});
