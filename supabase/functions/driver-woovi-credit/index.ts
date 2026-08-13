import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WOOVI_APP_ID = (Deno.env.get("WOOVI_APP_ID") ?? "").trim();
const WOOVI_API_BASE_URL = (Deno.env.get("WOOVI_API_BASE_URL") ?? "https://api.woovi.com").replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 15_000;

type JsonObject = Record<string, unknown>;
type ProviderCredit = {
  id: string;
  ride_id: string;
  driver_id: string;
  payment_account_id: string | null;
  amount_cents: number;
  created_at: string;
  status: string;
  last_error: string | null;
};
type StatementEntry = {
  id?: unknown;
  time?: unknown;
  description?: unknown;
  value?: unknown;
  type?: unknown;
  operationType?: unknown;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function bearer(req: Request): string {
  return (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function creditDescription(rideId: string): string {
  return `APOIS Corridas - corrida ${rideId}`;
}

async function persistReconciliationRequired(
  admin: ReturnType<typeof createClient<any, "public">>,
  creditId: string,
  reason: string,
): Promise<void> {
  const { error } = await admin
    .from("driver_provider_credits")
    .update({
      status: "processing",
      last_error: `reconciliation_required:${reason}`.slice(0, 900),
      updated_at: new Date().toISOString(),
    })
    .eq("id", creditId)
    .eq("status", "processing");
  if (error) console.error("[driver-woovi-credit] reconciliation state persist", creditId, error);
}

async function reconcileAmbiguousCredits(
  admin: ReturnType<typeof createClient<any, "public">>,
): Promise<{ reconciled: number; unresolved: number }> {
  const { data: credits, error: creditsError } = await admin
    .from("driver_provider_credits")
    .select("id,ride_id,driver_id,payment_account_id,amount_cents,created_at,status,last_error")
    .eq("provider", "woovi")
    .eq("status", "processing")
    .like("last_error", "reconciliation_required:%")
    .order("created_at", { ascending: true })
    .limit(10);

  if (creditsError) {
    console.error("[driver-woovi-credit] reconciliation lookup", creditsError);
    return { reconciled: 0, unresolved: 0 };
  }

  let reconciled = 0;
  let unresolved = 0;

  for (const rawCredit of credits ?? []) {
    const credit = rawCredit as ProviderCredit;
    if (!credit.payment_account_id) {
      unresolved += 1;
      continue;
    }

    const { data: account, error: accountError } = await admin
      .from("driver_payment_accounts")
      .select("id,pix_key,status")
      .eq("id", credit.payment_account_id)
      .eq("driver_id", credit.driver_id)
      .eq("provider", "woovi")
      .maybeSingle();
    if (accountError || !account || account.status !== "active" || !account.pix_key) {
      console.error("[driver-woovi-credit] reconciliation payment account unavailable", credit.id, accountError);
      unresolved += 1;
      continue;
    }

    const createdAt = new Date(credit.created_at);
    const start = new Date(createdAt.getTime() - 5 * 60_000).toISOString();
    const end = new Date(Date.now() + 60_000).toISOString();
    const statementUrl = new URL(
      `${WOOVI_API_BASE_URL}/api/v1/subaccount/${encodeURIComponent(account.pix_key)}/statement`,
    );
    statementUrl.searchParams.set("skip", "0");
    statementUrl.searchParams.set("limit", "100");
    statementUrl.searchParams.set("start", start);
    statementUrl.searchParams.set("end", end);

    let statementResponse: Response;
    try {
      statementResponse = await fetch(statementUrl, {
        headers: { Authorization: WOOVI_APP_ID, accept: "application/json" },
      });
    } catch (error) {
      console.warn("[driver-woovi-credit] statement unavailable", credit.id, String(error).slice(0, 300));
      unresolved += 1;
      continue;
    }

    if (!statementResponse.ok) {
      console.warn("[driver-woovi-credit] statement rejected", credit.id, statementResponse.status);
      unresolved += 1;
      continue;
    }

    let entries: StatementEntry[] = [];
    try {
      const parsed: unknown = await statementResponse.json();
      entries = Array.isArray(parsed) ? parsed.filter(isObject) as StatementEntry[] : [];
    } catch {
      unresolved += 1;
      continue;
    }

    const expectedDescription = creditDescription(credit.ride_id);
    const expectedAmount = Number(credit.amount_cents);
    const matches = entries.filter((entry) => {
      const entryType = String(entry.type ?? "").toUpperCase();
      const operationType = String(entry.operationType ?? "").toUpperCase();
      return cleanText(entry.description) === expectedDescription &&
        Number(entry.value) === expectedAmount &&
        (entryType === "CREDIT" || operationType === "CREDIT");
    });

    if (matches.length === 1) {
      const statementEntryId = cleanText(matches[0].id) ?? `statement:${credit.id}`;
      const { error: successError } = await admin.rpc("mark_driver_provider_credit_succeeded", {
        _credit_id: credit.id,
        _provider_operation_id: statementEntryId,
      });
      if (successError) {
        console.error("[driver-woovi-credit] reconciliation persist", credit.id, successError);
        unresolved += 1;
      } else {
        reconciled += 1;
      }
      continue;
    }

    if (matches.length > 1) {
      const ids = matches.map((entry) => cleanText(entry.id)).filter(Boolean).join(",").slice(0, 500);
      await persistReconciliationRequired(admin, credit.id, `ambiguous_statement_matches:${ids}`);
    }
    unresolved += 1;
  }

  return { reconciled, unresolved };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (bearer(req) !== SERVICE_ROLE) return json({ error: "unauthorized" }, 401);
  if (!WOOVI_APP_ID) return json({ error: "payment_provider_not_configured" }, 503);

  const admin = createClient<any, "public">(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const reconciliation = await reconcileAmbiguousCredits(admin);
  let processed = reconciliation.reconciled;
  let failed = 0;
  let unresolved = reconciliation.unresolved;
  const maxItems = 20;

  for (let i = 0; i < maxItems; i += 1) {
    const { data: rawCredit, error: claimError } = await admin.rpc("claim_driver_provider_credit", {
      _provider: "woovi",
    });
    if (claimError) {
      console.error("[driver-woovi-credit] claim", claimError);
      return json({ error: "credit_claim_failed", processed, failed, unresolved }, 500);
    }
    if (!rawCredit?.id) break;
    const credit = rawCredit as ProviderCredit;

    const { data: account, error: accountError } = await admin
      .from("driver_payment_accounts")
      .select("id,pix_key,status,provider_subaccount_id")
      .eq("id", credit.payment_account_id)
      .eq("driver_id", credit.driver_id)
      .eq("provider", "woovi")
      .maybeSingle();

    if (accountError || !account || account.status !== "active" || !account.pix_key) {
      const reason = `active_woovi_payment_account_missing:${accountError?.message ?? "not_found"}`.slice(0, 850);
      const { error: failureError } = await admin
        .from("driver_provider_credits")
        .update({ status: "failed", last_error: reason, updated_at: new Date().toISOString() })
        .eq("id", credit.id)
        .eq("status", "processing");
      if (failureError) console.error("[driver-woovi-credit] account failure persist", credit.id, failureError);
      failed += 1;
      continue;
    }

    const description = creditDescription(credit.ride_id);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    let responseText = "";
    let providerBody: JsonObject | null = null;

    try {
      response = await fetch(
        `${WOOVI_API_BASE_URL}/api/v1/subaccount/${encodeURIComponent(account.pix_key)}/credit`,
        {
          method: "POST",
          headers: {
            Authorization: WOOVI_APP_ID,
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({ value: Number(credit.amount_cents), description }),
          signal: controller.signal,
        },
      );
      responseText = await response.text();
      try {
        const parsed = responseText ? JSON.parse(responseText) : null;
        providerBody = isObject(parsed) ? parsed : null;
      } catch {
        providerBody = null;
      }
    } catch (error) {
      const reason = error instanceof DOMException && error.name === "AbortError"
        ? "provider_timeout"
        : `provider_transport_unknown:${String(error).slice(0, 300)}`;
      await persistReconciliationRequired(admin, credit.id, reason);
      unresolved += 1;
      continue;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const reason = `HTTP ${response.status}:${responseText.slice(0, 500)}`;
      const ambiguousHttpFailure = response.status >= 500 || [408, 425, 429].includes(response.status);

      // The provider's subaccount credit endpoint has no client-supplied
      // idempotency key. Timeout-like statuses, throttling and 5xx responses can
      // therefore be observed after the provider has already moved funds. Keep
      // the credit in processing and reconcile against the subaccount statement
      // instead of automatically issuing a duplicate credit.
      if (ambiguousHttpFailure) {
        await persistReconciliationRequired(admin, credit.id, `provider_http_ambiguous:${reason}`);
        unresolved += 1;
      } else {
        const { error: terminalError } = await admin
          .from("driver_provider_credits")
          .update({
            status: "failed",
            last_error: `provider_rejected:${reason}`.slice(0, 900),
            updated_at: new Date().toISOString(),
          })
          .eq("id", credit.id)
          .eq("status", "processing");
        if (terminalError) console.error("[driver-woovi-credit] provider rejection persist", credit.id, terminalError);
        failed += 1;
      }
      continue;
    }

    const returnedPixKey = cleanText(providerBody?.pixKey);
    const returnedValue = providerBody?.value === undefined ? null : Number(providerBody.value);
    const returnedDescription = cleanText(providerBody?.description);
    if (
      (returnedPixKey && returnedPixKey !== account.pix_key) ||
      (returnedValue !== null && returnedValue !== Number(credit.amount_cents)) ||
      (returnedDescription && returnedDescription !== description)
    ) {
      await persistReconciliationRequired(admin, credit.id, "provider_success_payload_mismatch");
      unresolved += 1;
      continue;
    }

    const providerOperationId = cleanText(providerBody?.id) ??
      cleanText(providerBody?.transactionID) ??
      cleanText(providerBody?.correlationID) ??
      `woovi-credit:${credit.id}`;

    const { error: successError } = await admin.rpc("mark_driver_provider_credit_succeeded", {
      _credit_id: credit.id,
      _provider_operation_id: providerOperationId,
    });
    if (successError) {
      console.error("[driver-woovi-credit] success persist failed", credit.id, successError);
      await persistReconciliationRequired(admin, credit.id, `success_persist_failed:${successError.message}`);
      unresolved += 1;
      continue;
    }

    processed += 1;
  }

  return json({ ok: true, processed, failed, unresolved });
});