import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MP_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN")?.trim() ?? "";
const MP_BASE_URL = (
  Deno.env.get("MERCADOPAGO_BASE_URL")?.trim() || "https://api.mercadopago.com"
).replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 15_000;

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "content-type": "application/json" },
  });

type Withdrawal = {
  id: string;
  driver_id: string;
  amount: number;
  pix_key: string;
  pix_key_type: "cpf" | "cnpj" | "email" | "phone" | "random";
  pix_holder_name: string | null;
  status?: string;
};

type ProviderResponse = {
  id?: string | number;
  end_to_end_id?: string;
  status?: string;
};

function normalizeAmount(value: unknown): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  const normalized = Math.round(amount * 100) / 100;
  if (normalized < 20 || normalized > 50_000) return null;
  return normalized;
}

function providerStatus(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json(req, { error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userResult, error: userError } = await userClient.auth.getUser();
    const userId = userResult.user?.id;
    if (userError || !userId) return json(req, { error: "unauthorized" }, 401);

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
      return json(req, {
        error: "payouts_disabled",
        detail: "Saques de créditos APOIS não estão habilitados.",
      }, 503);
    }

    let payload: { amount?: unknown } = {};
    try {
      payload = await req.json();
    } catch {
      return json(req, { error: "invalid_json" }, 400);
    }

    const amount = normalizeAmount(payload.amount);
    if (amount === null) {
      return json(req, {
        error: "invalid_withdrawal_amount",
        detail: "Informe um valor entre R$ 20,00 e R$ 50.000,00.",
      }, 422);
    }

    const { data: driver, error: driverError } = await admin
      .from("drivers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (driverError) return json(req, { error: "driver_lookup_failed" }, 500);
    if (!driver) return json(req, { error: "driver_not_found" }, 404);

    const { data: activeWithdrawal, error: activeError } = await admin
      .from("driver_withdrawals")
      .select("id,status,amount,created_at")
      .eq("driver_id", driver.id)
      .in("status", ["pending", "processing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeError) return json(req, { error: "withdrawal_lookup_failed" }, 500);
    if (activeWithdrawal) {
      return json(req, {
        error: "withdrawal_already_in_progress",
        withdrawalId: activeWithdrawal.id,
        status: activeWithdrawal.status,
      }, 409);
    }

    const { data: withdrawalId, error: requestError } = await userClient.rpc(
      "request_driver_withdrawal",
      { _amount: amount },
    );
    if (requestError || !withdrawalId) {
      return json(req, {
        error: "withdrawal_request_failed",
        detail: requestError?.message ?? "Não foi possível solicitar o saque.",
      }, 422);
    }

    const { data: withdrawalRow, error: withdrawalError } = await admin
      .from("driver_withdrawals")
      .select("id,driver_id,amount,pix_key,pix_key_type,pix_holder_name,status")
      .eq("id", withdrawalId)
      .maybeSingle();
    if (withdrawalError || !withdrawalRow) {
      return json(req, { error: "withdrawal_not_found" }, 500);
    }
    const withdrawal = withdrawalRow as Withdrawal;

    if (!MP_TOKEN) {
      await admin.rpc("mark_driver_withdrawal_failed", {
        _withdrawal_id: withdrawal.id,
        _reason: "MERCADOPAGO_ACCESS_TOKEN ausente",
        _response: null,
      });
      return json(req, { error: "provider_not_configured", withdrawalId: withdrawal.id }, 503);
    }

    const claim = await admin
      .from("driver_withdrawals")
      .update({ status: "processing", processed_at: new Date().toISOString() })
      .eq("id", withdrawal.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (claim.error) return json(req, { error: "withdrawal_claim_failed" }, 500);
    if (!claim.data) {
      return json(req, { error: "withdrawal_already_claimed", withdrawalId: withdrawal.id }, 409);
    }

    const pixKeyTypeMap: Record<Withdrawal["pix_key_type"], string> = {
      cpf: "CPF",
      cnpj: "CNPJ",
      email: "EMAIL",
      phone: "PHONE",
      random: "EVP",
    };
    const providerBody = {
      amount: Number(withdrawal.amount),
      description: `Saque APOIS — motorista ${withdrawal.driver_id.slice(0, 8)}`,
      external_reference: `payout:${withdrawal.id}`,
      receiver: {
        pix_key: withdrawal.pix_key,
        pix_key_type: pixKeyTypeMap[withdrawal.pix_key_type],
        name: withdrawal.pix_holder_name ?? undefined,
      },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    let rawText = "";
    let providerJson: ProviderResponse | Record<string, unknown> = {};
    try {
      response = await fetch(`${MP_BASE_URL}/v1/money_transfers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${MP_TOKEN}`,
          "X-Idempotency-Key": `payout-${withdrawal.id}`,
        },
        body: JSON.stringify(providerBody),
        signal: controller.signal,
      });
      rawText = await response.text();
      try {
        providerJson = JSON.parse(rawText);
      } catch {
        providerJson = { raw: rawText.slice(0, 1000) };
      }
    } catch (error) {
      const reason = error instanceof DOMException && error.name === "AbortError"
        ? "provider_timeout"
        : String(error).slice(0, 400);
      await admin.rpc("mark_driver_withdrawal_failed", {
        _withdrawal_id: withdrawal.id,
        _reason: reason,
        _response: null,
      });
      return json(req, { error: "provider_unavailable", withdrawalId: withdrawal.id }, 502);
    } finally {
      clearTimeout(timeout);
    }

    const provider = providerJson as ProviderResponse;
    const status = providerStatus(provider.status);
    const transferId = provider.id ? String(provider.id) : null;
    const endToEndId = provider.end_to_end_id ?? null;
    const paidStatuses = new Set(["approved", "completed", "paid", "processed", "success"]);
    const pendingStatuses = new Set(["pending", "processing", "in_process", "created"]);

    if (response.ok && paidStatuses.has(status)) {
      await admin.rpc("mark_driver_withdrawal_paid", {
        _withdrawal_id: withdrawal.id,
        _transfer_id: transferId,
        _end_to_end_id: endToEndId,
        _response: providerJson as never,
      });
      return json(req, {
        ok: true,
        withdrawalId: withdrawal.id,
        transferId,
        endToEndId,
        status,
      });
    }

    if (response.ok && (pendingStatuses.has(status) || (!status && transferId))) {
      return json(req, {
        ok: true,
        pending: true,
        withdrawalId: withdrawal.id,
        transferId,
        status: status || "processing",
      }, 202);
    }

    const reason = `HTTP ${response.status}: ${rawText.slice(0, 400)}`;
    await admin.rpc("mark_driver_withdrawal_failed", {
      _withdrawal_id: withdrawal.id,
      _reason: reason,
      _response: providerJson as never,
    });
    return json(req, {
      error: "provider_transfer_failed",
      withdrawalId: withdrawal.id,
      detail: reason,
    }, 502);
  } catch (error) {
    console.error("[request-driver-payout] unexpected", error);
    return json(req, { error: "unexpected" }, 500);
  }
});
