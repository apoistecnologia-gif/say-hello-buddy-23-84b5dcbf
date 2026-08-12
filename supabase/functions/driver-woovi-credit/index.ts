import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WOOVI_APP_ID = (Deno.env.get("WOOVI_APP_ID") ?? "").trim();
const WOOVI_API_BASE_URL = (Deno.env.get("WOOVI_API_BASE_URL") ?? "https://api.woovi.com").replace(/\/+$/, "");

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function bearer(req: Request): string {
  return (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (bearer(req) !== SERVICE_ROLE) return json({ error: "unauthorized" }, 401);
  if (!WOOVI_APP_ID) return json({ error: "payment_provider_not_configured" }, 503);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let processed = 0;
  let failed = 0;
  const maxItems = 20;

  for (let i = 0; i < maxItems; i += 1) {
    const { data: credit, error: claimError } = await admin.rpc("claim_driver_provider_credit", {
      _provider: "woovi",
    });
    if (claimError) {
      console.error("[driver-woovi-credit] claim", claimError);
      return json({ error: "credit_claim_failed", processed, failed }, 500);
    }
    if (!credit?.id) break;

    try {
      const { data: account, error: accountError } = await admin
        .from("driver_payment_accounts")
        .select("id,pix_key,status,provider_subaccount_id")
        .eq("id", credit.payment_account_id)
        .eq("driver_id", credit.driver_id)
        .eq("provider", "woovi")
        .maybeSingle();
      if (accountError) throw new Error(`payment_account_lookup_failed:${accountError.message}`);
      if (!account || account.status !== "active" || !account.pix_key) {
        throw new Error("active_woovi_payment_account_missing");
      }

      const response = await fetch(
        `${WOOVI_API_BASE_URL}/api/v1/subaccount/${encodeURIComponent(account.pix_key)}/credit`,
        {
          method: "POST",
          headers: {
            Authorization: WOOVI_APP_ID,
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            value: Number(credit.amount_cents),
            description: `APOIS Corridas - corrida ${credit.ride_id}`,
          }),
        },
      );

      const responseText = await response.text();
      let providerBody: Record<string, unknown> | null = null;
      try {
        const parsed = responseText ? JSON.parse(responseText) : null;
        providerBody = parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed as Record<string, unknown>
          : null;
      } catch {
        providerBody = null;
      }

      if (!response.ok) {
        throw new Error(`woovi_credit_failed:${response.status}:${responseText.slice(0, 300)}`);
      }

      const providerOperationId = String(
        providerBody?.transactionID ??
        providerBody?.correlationID ??
        providerBody?.id ??
        `${account.pix_key}:${credit.id}`,
      );

      const { error: successError } = await admin.rpc("mark_driver_provider_credit_succeeded", {
        _credit_id: credit.id,
        _provider_operation_id: providerOperationId,
      });
      if (successError) throw new Error(`credit_success_persist_failed:${successError.message}`);

      processed += 1;
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message.slice(0, 900) : "unknown_error";
      console.error("[driver-woovi-credit]", credit.id, message);
      const { error: failureError } = await admin.from("driver_provider_credits").update({
        status: "failed",
        last_error: message,
        updated_at: new Date().toISOString(),
      }).eq("id", credit.id).eq("status", "processing");
      if (failureError) console.error("[driver-woovi-credit] failure persist", failureError);
      failed += 1;
    }
  }

  return json({ ok: true, processed, failed });
});
