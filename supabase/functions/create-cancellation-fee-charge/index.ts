import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN")?.trim() ?? "";
const MP_BASE_URL = (
  Deno.env.get("MERCADOPAGO_BASE_URL")?.trim() || "https://api.mercadopago.com"
).replace(/\/+$/, "");

function json(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(req ? getCorsHeaders(req) : {}),
      "content-type": "application/json",
    },
  });
}

async function mpFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!MP_TOKEN) throw new Error("MERCADOPAGO_ACCESS_TOKEN_MISSING");
  const response = await fetch(`${MP_BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${MP_TOKEN}`,
      "X-Idempotency-Key":
        (init.headers as Record<string, string> | undefined)?.["X-Idempotency-Key"] ??
        crypto.randomUUID(),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`MP_HTTP_${response.status}:${text.slice(0, 400)}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`MP_BAD_JSON:${text.slice(0, 200)}`);
  }
}

type FeeRow = {
  id: string;
  passenger_id: string;
  amount: number;
  status: string | null;
  mp_payment_id: string | null;
  mp_qr_code: string | null;
  mp_qr_code_base64: string | null;
  mp_ticket_url: string | null;
  mp_expires_at: string | null;
};

type PassengerProfile = {
  id: string;
  email: string | null;
  name: string | null;
};

async function resolvePassengerProfile(
  admin: ReturnType<typeof createClient>,
  authUserId: string,
  authEmail: string | null,
): Promise<PassengerProfile | null> {
  const primary = await admin
    .from("users")
    .select("id,email,name")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (primary.data) return primary.data as PassengerProfile;

  const legacy = await admin
    .from("users")
    .select("id,email,name")
    .eq("id", authUserId)
    .maybeSingle();
  if (legacy.data) return legacy.data as PassengerProfile;

  if (primary.error || legacy.error) {
    console.error("[create-fee-charge] passenger lookup failed", {
      primary: primary.error?.message,
      legacy: legacy.error?.message,
    });
  }

  return authEmail
    ? {
        id: authUserId,
        email: authEmail,
        name: "Passageiro APOIS",
      }
    : null;
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, req);

    const token = (req.headers.get("Authorization") ?? "")
      .replace(/^Bearer\s+/i, "")
      .trim();
    if (!token) return json({ error: "unauthorized" }, 401, req);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const authUser = authData.user;
    if (authError || !authUser) {
      return json({ error: "unauthorized", detail: authError?.message }, 401, req);
    }

    const profile = await resolvePassengerProfile(
      admin,
      authUser.id,
      authUser.email ?? null,
    );
    if (!profile) return json({ error: "passenger_profile_missing" }, 404, req);

    let payload: { feeId?: string } = {};
    try {
      payload = (await req.json()) as { feeId?: string };
    } catch {
      payload = {};
    }

    let query = admin
      .from("cancellation_fees")
      .select(
        "id,passenger_id,amount,status,mp_payment_id,mp_qr_code,mp_qr_code_base64,mp_ticket_url,mp_expires_at",
      )
      .eq("passenger_id", profile.id)
      .in("status", ["pending", "open", "unpaid"])
      .order("created_at", { ascending: true })
      .limit(1);

    if (payload.feeId?.trim()) {
      query = query.eq("id", payload.feeId.trim()).limit(1);
    }

    const { data: feeData, error: feeError } = await query.maybeSingle();
    if (feeError) {
      return json({ error: "fee_lookup_failed", detail: feeError.message }, 500, req);
    }
    if (!feeData) {
      return json(
        {
          error: "fee_not_found_or_paid",
          message: "Esta multa não está mais pendente.",
        },
        404,
        req,
      );
    }

    const fee = feeData as FeeRow;
    const amount = Number(fee.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return json({ error: "fee_amount_invalid" }, 422, req);
    }

    const now = Date.now();
    const stillValid =
      Boolean(fee.mp_payment_id) &&
      Boolean(fee.mp_qr_code) &&
      (!fee.mp_expires_at || new Date(fee.mp_expires_at).getTime() > now + 60_000);

    if (stillValid) {
      return json(
        {
          ok: true,
          reused: true,
          feeId: fee.id,
          amount,
          qrCode: fee.mp_qr_code,
          qrCodeBase64: fee.mp_qr_code_base64,
          ticketUrl: fee.mp_ticket_url,
          expiresAt: fee.mp_expires_at,
        },
        200,
        req,
      );
    }

    const email =
      profile.email ?? authUser.email ?? `passageiro-${authUser.id.slice(0, 8)}@apois.app`;
    const [firstName, ...lastNameParts] = String(profile.name ?? "Passageiro APOIS")
      .trim()
      .split(/\s+/);
    const lastName = lastNameParts.join(" ") || "APOIS";
    const expiresAt = new Date(now + 60 * 60 * 1000).toISOString();

    type MercadoPagoPix = {
      id: number;
      status: string;
      date_of_expiration?: string;
      point_of_interaction?: {
        transaction_data?: {
          qr_code?: string;
          qr_code_base64?: string;
          ticket_url?: string;
        };
      };
    };

    let pix: MercadoPagoPix;
    try {
      pix = await mpFetch<MercadoPagoPix>("/v1/payments", {
        method: "POST",
        headers: {
          "X-Idempotency-Key": `fee-${fee.id}-${Math.floor(now / 60_000)}`,
        },
        body: JSON.stringify({
          transaction_amount: amount,
          description: "Multa de cancelamento — APOIS",
          payment_method_id: "pix",
          date_of_expiration: expiresAt,
          external_reference: `fee:${fee.id}`,
          notification_url: `${SUPABASE_URL}/functions/v1/mercadopago-webhook`,
          metadata: {
            kind: "cancellation_fee",
            fee_id: fee.id,
            passenger_id: profile.id,
            auth_user_id: authUser.id,
          },
          payer: {
            email,
            first_name: firstName || "Passageiro",
            last_name: lastName,
          },
        }),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("[create-fee-charge] Mercado Pago Pix failed", {
        feeId: fee.id,
        detail,
      });
      return json(
        {
          error: "mercadopago_pix_failed",
          message: "Não foi possível gerar o Pix agora. Tente novamente.",
          detail,
        },
        502,
        req,
      );
    }

    const transaction = pix.point_of_interaction?.transaction_data ?? {};
    const patch = {
      mp_payment_id: String(pix.id),
      mp_qr_code: transaction.qr_code ?? null,
      mp_qr_code_base64: transaction.qr_code_base64 ?? null,
      mp_ticket_url: transaction.ticket_url ?? null,
      mp_expires_at: pix.date_of_expiration ?? expiresAt,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await admin
      .from("cancellation_fees")
      .update(patch)
      .eq("id", fee.id)
      .eq("passenger_id", profile.id);
    if (updateError) {
      console.error("[create-fee-charge] Failed to persist Pix", {
        feeId: fee.id,
        message: updateError.message,
      });
    }

    if (!patch.mp_qr_code) {
      return json(
        {
          error: "pix_qr_missing",
          message: "O provedor não retornou o código Pix. Tente novamente.",
        },
        502,
        req,
      );
    }

    return json(
      {
        ok: true,
        reused: false,
        feeId: fee.id,
        amount,
        qrCode: patch.mp_qr_code,
        qrCodeBase64: patch.mp_qr_code_base64,
        ticketUrl: patch.mp_ticket_url,
        expiresAt: patch.mp_expires_at,
      },
      200,
      req,
    );
  } catch (error) {
    console.error("[create-fee-charge] Unexpected error", error);
    return json(
      {
        error: "unexpected_error",
        message: "Não foi possível gerar o Pix agora.",
        detail: error instanceof Error ? error.message : String(error),
      },
      500,
      req,
    );
  }
});
