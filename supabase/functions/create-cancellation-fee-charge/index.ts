import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MP_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN")?.trim() ?? "";
const MP_BASE = (Deno.env.get("MERCADOPAGO_BASE_URL")?.trim() || "https://api.mercadopago.com").replace(/\/+$/, "");

function cors(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  const origin = req.headers.get("Origin");
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (origin && allowed.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "content-type": "application/json" },
  });
}

function cleanEmail(value: unknown): string | null {
  const email = String(value ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.slice(0, 180) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  try {
    const token = (req.headers.get("Authorization") ?? "")
      .replace(/^Bearer\s+/i, "")
      .trim();
    if (!token) return json(req, { error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return json(req, { error: "unauthorized" }, 401);

    const { data: profile } = await admin
      .from("users")
      .select("id,email,name,deleted_at")
      .eq("auth_user_id", auth.user.id)
      .maybeSingle();
    if (!profile || profile.deleted_at) {
      return json(req, { error: "passenger_profile_missing" }, 404);
    }

    let payload: { feeId?: string } = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }

    let query = admin
      .from("cancellation_fees")
      .select(
        "id,passenger_id,amount,status,is_paid,mp_order_id,mp_order_status,mp_payment_id,mp_payment_status,mp_qr_code,mp_qr_code_base64,mp_ticket_url,mp_expires_at",
      )
      .eq("passenger_id", profile.id)
      .eq("is_paid", false)
      .in("status", ["pending", "open", "unpaid", "processing"])
      .order("created_at", { ascending: true })
      .limit(1);

    if (payload.feeId?.trim()) query = query.eq("id", payload.feeId.trim());

    const { data: fee, error: feeError } = await query.maybeSingle();
    if (feeError) return json(req, { error: "fee_lookup_failed" }, 500);
    if (!fee) {
      return json(
        req,
        {
          error: "fee_not_found_or_paid",
          message: "Esta multa não está mais pendente.",
        },
        404,
      );
    }

    const amount = Number(fee.amount ?? 0);
    if (!(amount > 0)) return json(req, { error: "fee_amount_invalid" }, 422);

    const reusableStatus = [
      "",
      "created",
      "processing",
      "action_required",
      "pending",
      "in_process",
      "authorized",
    ].includes(String(fee.mp_order_status || fee.mp_payment_status || "").toLowerCase());
    const reusable =
      Boolean((fee.mp_order_id || fee.mp_payment_id) && fee.mp_qr_code) &&
      (!fee.mp_expires_at ||
        new Date(fee.mp_expires_at).getTime() > Date.now() + 60_000) &&
      reusableStatus;

    if (reusable) {
      return json(req, {
        ok: true,
        reused: true,
        feeId: fee.id,
        amount,
        orderId: fee.mp_order_id ?? null,
        paymentId: fee.mp_payment_id ?? null,
        qrCode: fee.mp_qr_code,
        qrCodeBase64: fee.mp_qr_code_base64,
        ticketUrl: fee.mp_ticket_url,
        expiresAt: fee.mp_expires_at,
      });
    }

    if (!MP_TOKEN) {
      return json(
        req,
        {
          error: "mercadopago_configuration_missing",
          message: "O pagamento Pix ainda não está configurado.",
        },
        503,
      );
    }

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const names = String(profile.name || "Passageiro APOIS")
      .trim()
      .split(/\s+/);
    const payerEmail =
      cleanEmail(profile.email) ||
      cleanEmail(auth.user.email) ||
      `passageiro-${auth.user.id.slice(0, 8)}@apois.app`;

    const body = {
      type: "online",
      total_amount: amount.toFixed(2),
      external_reference: `fee:${fee.id}`,
      processing_mode: "automatic",
      transactions: {
        payments: [
          {
            amount: amount.toFixed(2),
            payment_method: {
              id: "pix",
              type: "bank_transfer",
            },
            expiration_time: "PT1H",
          },
        ],
      },
      payer: {
        email: payerEmail,
        first_name: names[0] || "Passageiro",
        last_name: names.slice(1).join(" ") || "APOIS",
      },
    };

    const mpResponse = await fetch(`${MP_BASE}/v1/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MP_TOKEN}`,
        "content-type": "application/json",
        "X-Idempotency-Key": `fee-order-${fee.id}`,
      },
      body: JSON.stringify(body),
    });

    const raw = await mpResponse.text();
    if (!mpResponse.ok) {
      console.error(
        "mercadopago_pix_order_failed",
        mpResponse.status,
        raw.slice(0, 500),
      );
      return json(
        req,
        {
          error: "mercadopago_pix_failed",
          message: "Não foi possível gerar o Pix agora.",
        },
        502,
      );
    }

    const order = JSON.parse(raw) as {
      id?: string;
      status?: string;
      status_detail?: string;
      external_reference?: string;
      transactions?: {
        payments?: Array<{
          id?: string;
          status?: string;
          status_detail?: string;
          payment_method?: {
            ticket_url?: string;
            qr_code?: string;
            qr_code_base64?: string;
          };
        }>;
      };
    };

    const payment = order.transactions?.payments?.[0];
    const method = payment?.payment_method ?? {};
    const orderId = String(order.id ?? "").trim();
    const paymentId = String(payment?.id ?? "").trim();
    const qrCode = String(method.qr_code ?? "").trim();

    if (!orderId || !qrCode) {
      console.error("mercadopago_pix_order_incomplete", raw.slice(0, 500));
      return json(req, { error: "pix_qr_missing" }, 502);
    }

    const patch = {
      fee_amount: amount,
      value: amount,
      status: "processing",
      provider: "mercadopago",
      provider_payment_id: paymentId || orderId,
      mp_order_id: orderId,
      mp_order_status: String(order.status ?? "action_required"),
      mp_order_status_detail: String(order.status_detail ?? "waiting_payment"),
      mp_payment_id: paymentId || null,
      mp_payment_status: String(payment?.status ?? order.status ?? "action_required"),
      qr_code: qrCode,
      qr_code_base64: method.qr_code_base64 ?? null,
      ticket_url: method.ticket_url ?? null,
      expires_at: expiresAt,
      mp_qr_code: qrCode,
      mp_qr_code_base64: method.qr_code_base64 ?? null,
      mp_ticket_url: method.ticket_url ?? null,
      mp_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await admin
      .from("cancellation_fees")
      .update(patch)
      .eq("id", fee.id)
      .eq("passenger_id", profile.id);
    if (updateError) return json(req, { error: "pix_persistence_failed" }, 500);

    return json(req, {
      ok: true,
      reused: false,
      feeId: fee.id,
      amount,
      orderId,
      paymentId: paymentId || null,
      qrCode,
      qrCodeBase64: patch.mp_qr_code_base64,
      ticketUrl: patch.mp_ticket_url,
      expiresAt,
    });
  } catch (error) {
    console.error("create_fee_charge_fatal", error);
    return json(
      req,
      {
        error: "unexpected_error",
        message: "Não foi possível gerar o Pix agora.",
      },
      500,
    );
  }
});
