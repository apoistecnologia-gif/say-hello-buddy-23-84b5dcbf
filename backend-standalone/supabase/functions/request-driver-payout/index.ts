// Edge Function: motorista autenticado solicita saque Pix.
//
// Fluxo:
// 1. Chama public.request_driver_withdrawal(amount) → cria pedido (status pending)
//    e já debita o saldo disponível na carteira (atômico).
// 2. Tenta enviar Pix via Mercado Pago (Money Out / Pix Transfers).
// 3. Sucesso → mark_driver_withdrawal_paid; falha → mark_driver_withdrawal_failed
//    (que faz estorno automático do saldo).
//
// Observação: a API de saída Pix do MP ("Money Out" / Pagos") exige habilitação
// específica na conta. Se o token não estiver autorizado, a chamada retorna erro
// e o saldo é estornado — o admin pode processar manualmente.
//
// Secrets: MERCADOPAGO_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// SUPABASE_ANON_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MP_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN")?.trim() ?? "";
const MP_BASE_URL = (
  Deno.env.get("MERCADOPAGO_BASE_URL")?.trim() || "https://api.mercadopago.com"
).replace(/\/+$/, "");

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...cors, "content-type": "application/json" },
  });

type Withdrawal = {
  id: string;
  driver_id: string;
  amount: number;
  pix_key: string;
  pix_key_type: "cpf" | "cnpj" | "email" | "phone" | "random";
  pix_holder_name: string | null;
};

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: uRes, error: uErr } = await userClient.auth.getUser();
    const userId = uRes?.user?.id;
    if (uErr || !userId) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: payoutSetting } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "finance.driver_payouts_enabled")
      .maybeSingle();
    const payoutsEnabled =
      payoutSetting?.value === true ||
      payoutSetting?.value === "true" ||
      (typeof payoutSetting?.value === "object" &&
        payoutSetting.value !== null &&
        (payoutSetting.value as { enabled?: boolean }).enabled === true);
    if (!payoutsEnabled) {
      return json(
        {
          error: "payouts_disabled",
          detail: "Saques de créditos MOVVI não estão habilitados.",
        },
        503,
      );
    }

    let payload: { amount?: number } = {};
    try {
      payload = await req.json();
    } catch {
      /* ignore */
    }
    const amount = Number(payload.amount ?? 0);
    if (!amount || amount < 20)
      return json({ error: "min_withdrawal_amount", detail: "Valor mínimo R$ 20,00" }, 422);

    // 1. Cria pedido + debita saldo (RPC valida chave e saldo)
    const { data: wid, error: rpcErr } = await userClient.rpc("request_driver_withdrawal", {
      _amount: amount,
    });
    if (rpcErr || !wid) {
      return json(
        {
          error: "withdrawal_request_failed",
          detail: rpcErr?.message ?? "erro",
        },
        422,
      );
    }

    const { data: wRow, error: wErr } = await admin
      .from("driver_withdrawals")
      .select("id,driver_id,amount,pix_key,pix_key_type,pix_holder_name")
      .eq("id", wid)
      .maybeSingle();
    if (wErr || !wRow) return json({ error: "withdrawal_not_found" }, 500);
    const w = wRow as Withdrawal;

    // 2. Tenta chamar MP Pix Transfer (Money Out).
    // Endpoint: /v1/money_transfers (requer conta habilitada). Se falhar, estorna.
    if (!MP_TOKEN) {
      await admin.rpc("mark_driver_withdrawal_failed", {
        _withdrawal_id: w.id,
        _reason: "MERCADOPAGO_ACCESS_TOKEN ausente",
        _response: null,
      });
      return json({ error: "mp_token_missing", withdrawalId: w.id }, 502);
    }

    // Marca como processing
    await admin
      .from("driver_withdrawals")
      .update({ status: "processing", processed_at: new Date().toISOString() })
      .eq("id", w.id);

    const pixKeyTypeMap: Record<Withdrawal["pix_key_type"], string> = {
      cpf: "CPF",
      cnpj: "CNPJ",
      email: "EMAIL",
      phone: "PHONE",
      random: "EVP",
    };

    const body = {
      amount: Number(w.amount),
      description: `Saque MOVVI — motorista ${w.driver_id.slice(0, 8)}`,
      external_reference: `payout:${w.id}`,
      receiver: {
        pix_key: w.pix_key,
        pix_key_type: pixKeyTypeMap[w.pix_key_type],
        name: w.pix_holder_name ?? undefined,
      },
    };

    let mpOk = false;
    let mpJson: unknown = null;
    let mpErrText = "";
    let transferId: string | null = null;
    let e2eId: string | null = null;

    try {
      const res = await fetch(`${MP_BASE_URL}/v1/money_transfers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${MP_TOKEN}`,
          "X-Idempotency-Key": `payout-${w.id}`,
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      try {
        mpJson = JSON.parse(text);
      } catch {
        mpJson = { raw: text };
      }
      if (res.ok) {
        mpOk = true;
        const j = mpJson as { id?: string | number; end_to_end_id?: string };
        transferId = j.id ? String(j.id) : null;
        e2eId = j.end_to_end_id ?? null;
      } else {
        mpErrText = `HTTP ${res.status}: ${text.slice(0, 400)}`;
      }
    } catch (e) {
      mpErrText = String(e).slice(0, 400);
    }

    if (mpOk) {
      await admin.rpc("mark_driver_withdrawal_paid", {
        _withdrawal_id: w.id,
        _transfer_id: transferId,
        _end_to_end_id: e2eId,
        _response: mpJson as never,
      });
      return json({
        ok: true,
        withdrawalId: w.id,
        transferId,
        endToEndId: e2eId,
      });
    }

    // Falha → estorna
    await admin.rpc("mark_driver_withdrawal_failed", {
      _withdrawal_id: w.id,
      _reason: mpErrText || "Falha ao enviar Pix",
      _response: mpJson as never,
    });
    return json({ error: "mp_transfer_failed", withdrawalId: w.id, detail: mpErrText }, 502);
  } catch (e) {
    console.error("[request-driver-payout] unexpected", e);
    return json({ error: "unexpected", detail: String(e).slice(0, 300) }, 500);
  }
});
