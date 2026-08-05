import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { importPKCS8, SignJWT } from "npm:jose@5.9.6";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
const FIREBASE_B64 = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_B64")?.trim() ?? "";
const WORKER_SECRET = Deno.env.get("PUSH_WORKER_SECRET")?.trim() ?? "";
const MAX_BATCH = 50;
const FETCH_TIMEOUT_MS = 12_000;

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type OutboxRow = {
  id: string;
  user_id: string;
  event: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  attempt_count: number;
  max_attempts: number;
};

type TokenRow = {
  token: string;
  platform: string;
};

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return new Response(JSON.stringify({ request_id: requestId, ...(body as Record<string, unknown>) }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      pragma: "no-cache",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
      "x-request-id": requestId,
    },
  });
}

function readServiceAccount(): ServiceAccount {
  if (!FIREBASE_B64) throw new Error("firebase_secret_missing");
  let decoded = "";
  try {
    decoded = new TextDecoder().decode(Uint8Array.from(atob(FIREBASE_B64), (char) => char.charCodeAt(0)));
  } catch {
    throw new Error("firebase_secret_invalid_base64");
  }
  const account = JSON.parse(decoded) as Partial<ServiceAccount>;
  if (!account.project_id || !account.client_email || !account.private_key) {
    throw new Error("firebase_secret_invalid");
  }
  if (!/^[a-z0-9-]{4,100}$/i.test(account.project_id)) throw new Error("firebase_project_invalid");
  return account as ServiceAccount;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function getAccessToken(account: ServiceAccount): Promise<string> {
  const tokenUri = account.token_uri ?? "https://oauth2.googleapis.com/token";
  if (!tokenUri.startsWith("https://")) throw new Error("firebase_token_uri_invalid");
  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(account.private_key, "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.client_email)
    .setSubject(account.client_email)
    .setAudience(tokenUri)
    .setIssuedAt(now)
    .setExpirationTime(now + 3300)
    .sign(key);

  const response = await fetchWithTimeout(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`firebase_oauth_failed:${response.status}`);
  const payload = await response.json().catch(() => ({}));
  if (typeof payload.access_token !== "string" || !payload.access_token) {
    throw new Error("firebase_access_token_missing");
  }
  return payload.access_token;
}

function normalizeData(data: Record<string, unknown>): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    if (!/^[a-zA-Z0-9_.-]{1,60}$/.test(key)) continue;
    if (typeof value === "string") output[key] = value.slice(0, 500);
    else if (typeof value === "number" || typeof value === "boolean") output[key] = String(value);
  }
  return output;
}

function permanentFailure(status: number, text: string): boolean {
  return status === 404 || text.includes("UNREGISTERED") || text.includes("INVALID_ARGUMENT");
}

function retryDelaySeconds(attempt: number): number {
  return Math.min(3600, Math.max(30, 30 * 2 ** Math.max(0, attempt - 1)));
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, requestId);
  if (!SUPABASE_URL || !SERVICE_ROLE || !FIREBASE_B64 || !WORKER_SECRET) {
    return json({ error: "service_unavailable" }, 503, requestId);
  }

  const providedSecret = req.headers.get("x-push-worker-secret")?.trim() ?? "";
  if (!providedSecret || providedSecret !== WORKER_SECRET) {
    return json({ error: "unauthorized" }, 401, requestId);
  }

  let limit = 20;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body.limit === "number" && Number.isInteger(body.limit)) {
      limit = Math.min(MAX_BATCH, Math.max(1, body.limit));
    }
  } catch {
    return json({ error: "invalid_json" }, 400, requestId);
  }

  const workerId = `push-${crypto.randomUUID()}`;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    await admin.rpc("recover_stale_push_deliveries", { _older_than_minutes: 10 });

    const { data: claimed, error: claimError } = await admin.rpc("claim_push_delivery_batch", {
      _worker_id: workerId,
      _limit: limit,
    });
    if (claimError) throw new Error("claim_failed");

    const jobs = (claimed ?? []) as OutboxRow[];
    if (!jobs.length) return json({ ok: true, claimed: 0, sent: 0, failed: 0 }, 200, requestId);

    const account = readServiceAccount();
    const bearer = await getAccessToken(account);
    let sent = 0;
    let failed = 0;
    let noToken = 0;
    let invalidated = 0;

    for (const job of jobs) {
      const { data: tokenRows, error: tokenError } = await admin
        .from("user_notification_tokens")
        .select("token,platform")
        .eq("user_id", job.user_id)
        .eq("is_active", true)
        .eq("platform", "android");

      if (tokenError) {
        failed += 1;
        await admin.rpc("fail_push_delivery", {
          _id: job.id,
          _error_code: "token_lookup_failed",
          _retry_after_seconds: retryDelaySeconds(job.attempt_count),
        });
        continue;
      }

      const tokens = [...new Set(((tokenRows ?? []) as TokenRow[]).map((row) => row.token).filter(Boolean))];
      if (!tokens.length) {
        noToken += 1;
        await admin.rpc("fail_push_delivery", {
          _id: job.id,
          _error_code: "no_active_token",
          _retry_after_seconds: retryDelaySeconds(job.attempt_count),
        });
        continue;
      }

      let delivered = false;
      let providerMessageId: string | null = null;
      let lastError = "fcm_delivery_failed";

      for (const token of tokens) {
        try {
          const response = await fetchWithTimeout(
            `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
            {
              method: "POST",
              headers: {
                authorization: `Bearer ${bearer}`,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                message: {
                  token,
                  notification: { title: job.title, body: job.body ?? "" },
                  data: { event: job.event, ...normalizeData(job.data) },
                  android: {
                    priority: "high",
                    ttl: "120s",
                    notification: {
                      channel_id: "apois_rides",
                      sound: "default",
                      visibility: "private",
                    },
                  },
                },
              }),
            },
          );

          const responseText = await response.text();
          if (response.ok) {
            delivered = true;
            try {
              const parsed = JSON.parse(responseText) as { name?: string };
              providerMessageId = typeof parsed.name === "string" ? parsed.name.slice(0, 500) : null;
            } catch {
              providerMessageId = null;
            }
            break;
          }

          lastError = `fcm_${response.status}`;
          if (permanentFailure(response.status, responseText)) {
            const { error: deactivateError } = await admin
              .from("user_notification_tokens")
              .update({
                is_active: false,
                invalidated_at: new Date().toISOString(),
                last_error_code: lastError,
              })
              .eq("token", token)
              .eq("is_active", true);
            if (!deactivateError) invalidated += 1;
          }
        } catch {
          lastError = "fcm_timeout_or_network_error";
        }
      }

      if (delivered) {
        const { data: completed, error: completeError } = await admin.rpc("complete_push_delivery", {
          _id: job.id,
          _provider_message_id: providerMessageId,
        });
        if (completeError || completed !== true) {
          failed += 1;
          continue;
        }
        sent += 1;
      } else {
        failed += 1;
        await admin.rpc("fail_push_delivery", {
          _id: job.id,
          _error_code: lastError,
          _retry_after_seconds: retryDelaySeconds(job.attempt_count),
        });
      }
    }

    return json({
      ok: failed === 0,
      claimed: jobs.length,
      sent,
      failed,
      no_token: noToken,
      invalidated_tokens: invalidated,
      worker_id: workerId,
    }, 200, requestId);
  } catch (error) {
    console.error("[APOIS PUSH OUTBOX]", requestId, error instanceof Error ? error.message : "unknown");
    return json({ error: "push_worker_failed" }, 500, requestId);
  }
});
