import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const PROVIDER_FUNCTIONS: Record<string, string> = {
  asaas: "asaas-create-ride-pix",
  pagbank: "pagbank-create-ride-pix",
  woovi: "woovi-create-ride-pix",
};

type CheckoutAction = "recover" | "retry";
type RideRow = {
  id: string;
  passenger_id: string;
  estimated_price: number | string;
  payment_method: string;
  payment_provider: string | null;
  fare_amount_cents: number | string | null;
  processing_fee_cents: number | string | null;
  passenger_charge_cents: number | string | null;
};

type JsonObject = Record<string, unknown>;

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "content-type": "application/json" },
  });
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function safeCents(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function financialSnapshot(ride: RideRow) {
  const fareSnapshot = safeCents(ride.fare_amount_cents);
  const feeSnapshot = safeCents(ride.processing_fee_cents);
  const totalSnapshot = safeCents(ride.passenger_charge_cents);

  if (fareSnapshot !== null && fareSnapshot > 0 && feeSnapshot !== null && totalSnapshot !== null && totalSnapshot > 0) {
    if (totalSnapshot !== fareSnapshot + feeSnapshot) {
      throw new Error("invalid_ride_financial_snapshot");
    }
    return {
      fareCents: fareSnapshot,
      processingFeeCents: feeSnapshot,
      passengerChargeCents: totalSnapshot,
      legacyFinancialSnapshot: false,
    };
  }

  const legacyFare = Math.round(Number(ride.estimated_price) * 100);
  if (!Number.isSafeInteger(legacyFare) || legacyFare <= 0) {
    throw new Error("invalid_ride_amount");
  }
  return {
    fareCents: legacyFare,
    processingFeeCents: 0,
    passengerChargeCents: legacyFare,
    legacyFinancialSnapshot: true,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
      return json(req, { error: "server_configuration_missing" }, 500);
    }

    const authorization = (req.headers.get("Authorization") ?? "").trim();
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json(req, { error: "unauthorized" }, 401);

    let input: JsonObject;
    try {
      input = asObject(await req.json()) ?? {};
    } catch {
      return json(req, { error: "invalid_json" }, 400);
    }

    const rideId = typeof input.rideId === "string" ? input.rideId.trim() : "";
    const action: CheckoutAction = input.action === "retry" ? "retry" : "recover";
    if (!rideId) return json(req, { error: "ride_id_required" }, 422);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json(req, { error: "unauthorized" }, 401);

    const { data: passenger, error: passengerError } = await admin
      .from("users")
      .select("id,deleted_at")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();
    if (passengerError) throw new Error(`passenger_lookup_failed:${passengerError.message}`);
    if (!passenger || passenger.deleted_at) return json(req, { error: "passenger_profile_missing" }, 404);

    const { data: rideData, error: rideError } = await admin
      .from("rides")
      .select("id,passenger_id,estimated_price,payment_method,payment_provider,fare_amount_cents,processing_fee_cents,passenger_charge_cents")
      .eq("id", rideId)
      .eq("passenger_id", passenger.id)
      .maybeSingle();
    if (rideError) throw new Error(`ride_lookup_failed:${rideError.message}`);
    if (!rideData) return json(req, { error: "ride_not_found" }, 404);

    const ride = rideData as RideRow;
    if (String(ride.payment_method ?? "").trim().toLowerCase() !== "pix") {
      return json(req, { error: "ride_payment_method_not_pix" }, 409);
    }

    const provider = String(ride.payment_provider ?? "").trim().toLowerCase();
    const providerFunction = PROVIDER_FUNCTIONS[provider];
    if (!provider || !providerFunction) {
      return json(req, { error: "payment_provider_not_supported", provider: provider || null }, 409);
    }

    const snapshot = financialSnapshot(ride);
    const providerResponse = await fetch(`${SUPABASE_URL}/functions/v1/${providerFunction}`, {
      method: "POST",
      headers: {
        Authorization: authorization,
        apikey: ANON_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({ rideId, action }),
    });

    const raw = await providerResponse.text();
    let providerBody: JsonObject | null = null;
    try {
      providerBody = asObject(raw ? JSON.parse(raw) : null);
    } catch {
      providerBody = null;
    }

    if (!providerBody) {
      console.error("[ride-pix-checkout] provider returned invalid JSON", provider, providerResponse.status);
      return json(req, { error: "payment_provider_invalid_response", provider }, 502);
    }

    const returnedAmount = safeCents(providerBody.amountCents);
    if (returnedAmount !== null && returnedAmount !== snapshot.passengerChargeCents) {
      console.error("[ride-pix-checkout] amount mismatch", provider, returnedAmount, snapshot.passengerChargeCents);
      return json(req, { error: "payment_amount_mismatch", provider }, 502);
    }

    return json(req, {
      ...providerBody,
      provider,
      fareCents: snapshot.fareCents,
      processingFeeCents: snapshot.processingFeeCents,
      passengerChargeCents: snapshot.passengerChargeCents,
      legacyFinancialSnapshot: snapshot.legacyFinancialSnapshot,
    }, providerResponse.status);
  } catch (error) {
    console.error("[ride-pix-checkout]", error);
    return json(req, { error: "ride_pix_checkout_failed" }, 500);
  }
});
