// Edge Function: passageiro autenticado gera (ou reaproveita) uma cobrança
// Pix no Mercado Pago para uma multa de cancelamento em aberto.
//
// - Requer JWT do passageiro (verify_jwt = true).
// - external_reference = "fee:<cancellation_fee_id>" para o webhook identificar
//   corretamente e chamar public.settle_cancellation_fee.
// - Idempotente: se já existe um mp_payment_id ainda válido (pendente + não
//   expirado) para a multa, devolve o QR salvo em vez de criar outro.
//
// Retorno: { ok, feeId, amount, qrCode, qrCodeBase64, ticketUrl, expiresAt }.
//
// Secrets: MERCADOPAGO_ACCESS_TOKEN, MERCADOPAGO_BASE_URL (opcional),
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MP_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN")?.trim() ?? "";
const MP_BASE_URL = (
  Deno.env.get("MERCADOPAGO_BASE_URL")?.trim() || "https://api.mercadopago.com"
).replace(/\/+$/, "");

import { getCorsHeaders } from "../_shared/cors.ts";

function json(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 
      ...(req ? getCorsHeaders(req) : { "Access-Control-Allow-Origin": "*" }),
      "content-type": "application/json" 
    },
  });
}

async function mpFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!MP_TOKEN) throw new Error("MERCADOPAGO_ACCESS_TOKEN_MISSING");
  const res = await fetch(`${MP_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MP_TOKEN}`,
      "X-Idempotency-Key":
        (init.headers as Record<string, string> | undefined)?.["X-Idempotency-Key"] ??
        crypto.randomUUID(),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MP_HTTP_${res.status}:${text.slice(0, 400)}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`MP_BAD_JSON:${text.slice(0, 200)}`);
  }
}

type FeeRow = {
  id: string;
  passenger_id: string;
  fee_amount: number;
  is_paid: boolean;
  mp_payment_id: string | null;
  mp_qr_code: string | null;
  mp_qr_code_base64: string | null;
  mp_ticket_url: string | null;
  mp_expires_at: string | null;
};

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    const userId = userRes?.user?.id;
    if (userErr || !userId) return json({ error: "unauthorized" }, 401);

    let payload: { feeId?: string } = {};
    try {
      payload = await req.json();
    } catch {
      // ignore — feeId opcional
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Busca a multa: a solicitada, ou a mais antiga em aberto do passageiro.
    let feeQuery = admin
      .from("cancellation_fees")
      .select(
        "id,passenger_id,fee_amount,is_paid,mp_payment_id,mp_qr_code,mp_qr_code_base64,mp_ticket_url,mp_expires_at",
      )
      .eq("passenger_id", userId)
      .eq("is_paid", false)
      .order("created_at", { ascending: true })
      .limit(1);
    if (payload.feeId) feeQuery = feeQuery.eq("id", payload.feeId).limit(1);

    const { data: feeRow, error: feeErr } = await feeQuery.maybeSingle();
    if (feeErr) return json({ error: "fee_lookup_failed", detail: feeErr.message }, 500);
    if (!feeRow) return json({ error: "fee_not_found_or_paid" }, 404);
    const fee = feeRow as FeeRow;

    if (Number(fee.fee_amount) <= 0) return json({ error: "fee_amount_invalid" }, 422);

    // Idempotência: se já existe QR válido, devolve o existente.
    const now = Date.now();
    const stillValid =
      fee.mp_payment_id &&
      fee.mp_qr_code &&
      (!fee.mp_expires_at || new Date(fee.mp_expires_at).getTime() > now + 60_000);
    if (stillValid) {
      return json({
        ok: true,
        reused: true,
        feeId: fee.id,
        amount: Number(fee.fee_amount),
        qrCode: fee.mp_qr_code,
        qrCodeBase64: fee.mp_qr_code_base64,
        ticketUrl: fee.mp_ticket_url,
        expiresAt: fee.mp_expires_at,
      });
    }

    // Busca email do passageiro (obrigatório no Pix do MP).
    const { data: usr } = await admin
      .from("users")
      .select("email,name")
      .eq("auth_user_id", userId)
      .maybeSingle();
    const email =
      usr?.email ?? userRes?.user?.email ?? `passageiro-${userId.slice(0, 8)}@apois.app`;
    const [firstName, ...rest] = String(usr?.name ?? "Passageiro APOIS")
      .trim()
      .split(/\s+/);
    const lastName = rest.join(" ") || "APOIS";

    const expiresAtIso = new Date(now + 60 * 60 * 1000).toISOString();

    type MpPix = {
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

    let pix: MpPix;
    try {
      pix = await mpFetch<MpPix>("/v1/payments", {
        method: "POST",
        headers: {
          "X-Idempotency-Key": `fee-${fee.id}-${Math.floor(now / 60000)}`,
        },
        body: JSON.stringify({
          transaction_amount: Number(fee.fee_amount),
          description: "Multa de cancelamento — APOIS",
          payment_method_id: "pix",
          date_of_expiration: expiresAtIso,
          external_reference: `fee:${fee.id}`,
          notification_url: `${SUPABASE_URL}/functions/v1/mercadopago-webhook`,
          metadata: {
            kind: "cancellation_fee",
            fee_id: fee.id,
            passenger_id: userId,
          },
          payer: { email, first_name: firstName, last_name: lastName },
        }),
      });
    } catch (e) {
      const detail = String(e);
      console.error("[create-fee-charge] pix failed", detail);
      return json({ error: "mercadopago_pix_failed", detail }, 502);
    }

    const qr = pix.point_of_interaction?.transaction_data ?? {};
    const patch = {
      mp_payment_id: String(pix.id),
      mp_qr_code: qr.qr_code ?? null,
      mp_qr_code_base64: qr.qr_code_base64 ?? null,
      mp_ticket_url: qr.ticket_url ?? null,
      mp_expires_at: pix.date_of_expiration ?? expiresAtIso,
    };
    await admin.from("cancellation_fees").update(patch).eq("id", fee.id);

    return json({
      ok: true,
      reused: false,
      feeId: fee.id,
      amount: Number(fee.fee_amount),
      qrCode: patch.mp_qr_code,
      qrCodeBase64: patch.mp_qr_code_base64,
      ticketUrl: patch.mp_ticket_url,
      expiresAt: patch.mp_expires_at,
    });
  } catch (e) {
    console.error("[create-fee-charge] unexpected", e);
    return json({ error: "unexpected_error", detail: String(e).slice(0, 300) }, 500);
  }
});
