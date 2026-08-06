import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { importPKCS8, SignJWT } from "npm:jose@5.9.6";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
const FIREBASE_B64 = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_B64")?.trim() ?? "";
const WORKER_SECRET = Deno.env.get("PUSH_WORKER_SECRET")?.trim() ?? "";
const MAX_BATCH = 50;
const MAX_BODY_BYTES = 2048;
const FETCH_TIMEOUT_MS = 12_000;
const PROVIDER = "fcm";
const WORKER_ID_RE = /^[a-zA-Z0-9_-]{8,100}$/;

type ServiceAccount = { project_id: string; client_email: string; private_key: string; token_uri?: string };
type OutboxRow = {
  id: string; user_id: string; event: string; title: string; body: string | null;
  data: Record<string, unknown>; attempt_count: number; max_attempts: number;
};
type TokenRow = { token: string; platform: string };
type CircuitRow = { allowed: boolean; state: string; retry_after_seconds: number };

function headers(requestId: string, allow?: string) {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    pragma: "no-cache",
    expires: "0",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "x-request-id": requestId,
    ...(allow ? { allow } : {}),
  };
}

function json(body: Record<string, unknown>, status: number, requestId: string, allow?: string) {
  return new Response(JSON.stringify({ request_id: requestId, ...body }), {
    status,
    headers: headers(requestId, allow),
  });
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}

function readServiceAccount(): ServiceAccount {
  if (!FIREBASE_B64) throw new Error("firebase_secret_missing");
  let decoded = "";
  try {
    decoded = new TextDecoder().decode(Uint8Array.from(atob(FIREBASE_B64), (char) => char.charCodeAt(0)));
  } catch {
    throw new Error("firebase_secret_invalid_base64");
  }
  let account: Partial<ServiceAccount>;
  try { account = JSON.parse(decoded); } catch { throw new Error("firebase_secret_invalid_json"); }
  if (!account.project_id || !account.client_email || !account.private_key) throw new Error("firebase_secret_invalid");
  if (!/^[a-z0-9-]{4,100}$/i.test(account.project_id)) throw new Error("firebase_project_invalid");
  if (!account.client_email.endsWith(".gserviceaccount.com")) throw new Error("firebase_email_invalid");
  if (!account.private_key.includes("BEGIN PRIVATE KEY")) throw new Error("firebase_private_key_invalid");
  return account as ServiceAccount;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timeout); }
}

async function getAccessToken(account: ServiceAccount): Promise<string> {
  const tokenUri = account.token_uri ?? "https://oauth2.googleapis.com/token";
  const parsedUri = new URL(tokenUri);
  if (parsedUri.protocol !== "https:" || parsedUri.hostname !== "oauth2.googleapis.com") {
    throw new Error("firebase_token_uri_invalid");
  }
  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(account.private_key, "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.client_email).setSubject(account.client_email).setAudience(tokenUri)
    .setIssuedAt(now).setExpirationTime(now + 3300).sign(key);
  const response = await fetchWithTimeout(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) throw new Error(`firebase_oauth_failed:${response.status}`);
  const payload = await response.json().catch(() => ({}));
  if (typeof payload.access_token !== "string" || payload.access_token.length < 20) {
    throw new Error("firebase_access_token_missing");
  }
  return payload.access_token;
}

function normalizeData(data: Record<string, unknown>): Record<string, string> {
  const output: Record<string, string> = {};
  let accepted = 0;
  for (const [key, value] of Object.entries(data ?? {})) {
    if (accepted >= 20 || !/^[a-zA-Z0-9_.-]{1,60}$/.test(key)) continue;
    let normalized: string | null = null;
    if (typeof value === "string") normalized = value.replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, 500);
    else if (typeof value === "number" && Number.isFinite(value)) normalized = String(value);
    else if (typeof value === "boolean") normalized = String(value);
    if (normalized !== null) { output[key] = normalized; accepted += 1; }
  }
  return output;
}

function permanentTokenFailure(status: number, text: string): boolean {
  return status === 404 || text.includes("UNREGISTERED") || text.includes("registration-token-not-registered");
}

function permanentProviderFailure(status: number): boolean {
  return status === 401 || status === 403;
}

function retryDelaySeconds(attempt: number): number {
  const safeAttempt = Number.isFinite(attempt) ? Math.max(1, Math.min(10, Math.trunc(attempt))) : 1;
  return Math.min(3600, 30 * 2 ** (safeAttempt - 1));
}

Deno.serve(async (req) => {
  const incomingRequestId = req.headers.get("x-request-id")?.trim() ?? "";
  const requestId = WORKER_ID_RE.test(incomingRequestId) ? incomingRequestId : crypto.randomUUID();
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(requestId, "POST, OPTIONS") });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, requestId, "POST, OPTIONS");
  if (!SUPABASE_URL || !SERVICE_ROLE || !FIREBASE_B64 || !WORKER_SECRET || WORKER_SECRET.length < 32) {
    return json({ error: "service_unavailable" }, 503, requestId);
  }
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) return json({ error: "unsupported_media_type" }, 415, requestId);
  const declaredLength = req.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_BODY_BYTES)) {
    return json({ error: "payload_too_large" }, 413, requestId);
  }
  const providedSecret = req.headers.get("x-push-worker-secret")?.trim() ?? "";
  if (!providedSecret || !constantTimeEqual(providedSecret, WORKER_SECRET)) {
    return json({ error: "unauthorized" }, 401, requestId);
  }

  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413, requestId);
  let body: Record<string, unknown> = {};
  try {
    const parsed = rawBody ? JSON.parse(rawBody) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    body = parsed;
  } catch { return json({ error: "invalid_json" }, 400, requestId); }
  if (Object.keys(body).some((key) => key !== "limit")) return json({ error: "unexpected_field" }, 422, requestId);
  const requestedLimit = body.limit ?? 20;
  if (typeof requestedLimit !== "number" || !Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > MAX_BATCH) {
    return json({ error: "invalid_limit" }, 422, requestId);
  }
  const limit = requestedLimit;
  const workerId = `push-${crypto.randomUUID()}`;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const { error: ensureError } = await admin.rpc("ensure_push_provider_health", { _provider: PROVIDER });
    if (ensureError) throw new Error("provider_health_init_failed");
    const { data: circuitData, error: circuitError } = await admin.rpc("can_send_push_provider", { _provider: PROVIDER });
    if (circuitError) throw new Error("provider_health_check_failed");
    const circuit = ((circuitData ?? [])[0] ?? { allowed: true, state: "closed", retry_after_seconds: 0 }) as CircuitRow;
    if (!circuit.allowed) {
      return json({ ok: false, skipped: true, reason: "provider_circuit_open", provider_state: circuit.state, retry_after_seconds: circuit.retry_after_seconds }, 503, requestId);
    }

    const { error: recoverError } = await admin.rpc("recover_stale_push_deliveries", { _older_than_minutes: 10 });
    if (recoverError) throw new Error("stale_recovery_failed");
    const { data: claimed, error: claimError } = await admin.rpc("claim_push_delivery_batch", { _worker_id: workerId, _limit: limit });
    if (claimError) throw new Error("claim_failed");
    const jobs = (claimed ?? []) as OutboxRow[];
    if (!jobs.length) return json({ ok: true, claimed: 0, sent: 0, failed: 0, provider_state: circuit.state }, 200, requestId);

    const account = readServiceAccount();
    let bearer: string;
    try { bearer = await getAccessToken(account); }
    catch (error) {
      const errorCode = error instanceof Error ? error.message.slice(0, 160) : "firebase_oauth_failed";
      await admin.rpc("record_push_provider_failure", { _provider: PROVIDER, _error_code: errorCode, _http_status: null, _permanent: true });
      for (const job of jobs) await admin.rpc("fail_push_delivery", { _id: job.id, _error_code: errorCode, _retry_after_seconds: 300 });
      return json({ error: "provider_auth_failed", claimed: jobs.length }, 503, requestId);
    }

    let sent = 0, failed = 0, noToken = 0, invalidated = 0, providerFailures = 0;
    for (const job of jobs) {
      if (!job.id || !job.user_id || !job.event || !job.title) {
        failed += 1;
        await admin.rpc("fail_push_delivery", { _id: job.id, _error_code: "invalid_outbox_row", _retry_after_seconds: 300 });
        continue;
      }
      const { data: tokenRows, error: tokenError } = await admin.from("user_notification_tokens")
        .select("token,platform").eq("user_id", job.user_id).eq("is_active", true)
        .eq("permission_status", "granted").eq("platform", "android");
      if (tokenError) {
        failed += 1;
        await admin.rpc("fail_push_delivery", { _id: job.id, _error_code: "token_lookup_failed", _retry_after_seconds: retryDelaySeconds(job.attempt_count) });
        continue;
      }
      const tokens = [...new Set(((tokenRows ?? []) as TokenRow[]).map((row) => row.token?.trim()).filter((token): token is string => Boolean(token && token.length >= 20)))];
      if (!tokens.length) {
        noToken += 1;
        await admin.rpc("fail_push_delivery", { _id: job.id, _error_code: "no_active_token", _retry_after_seconds: retryDelaySeconds(job.attempt_count) });
        continue;
      }

      let delivered = false;
      let providerMessageId: string | null = null;
      let lastError = "fcm_delivery_failed";
      let lastHttpStatus: number | null = null;
      for (const token of tokens) {
        try {
          const response = await fetchWithTimeout(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
            method: "POST",
            headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
            body: JSON.stringify({ message: {
              token,
              notification: { title: job.title.slice(0, 100), body: (job.body ?? "").slice(0, 500) },
              data: { event: job.event.slice(0, 80), ...normalizeData(job.data) },
              android: { priority: "high", ttl: "120s", notification: { channel_id: "apois_rides", sound: "default", visibility: "private" } },
            } }),
          });
          lastHttpStatus = response.status;
          const responseText = (await response.text()).slice(0, 4096);
          if (response.ok) {
            delivered = true;
            try { const parsed = JSON.parse(responseText) as { name?: string }; providerMessageId = typeof parsed.name === "string" ? parsed.name.slice(0, 500) : null; }
            catch { providerMessageId = null; }
            await admin.rpc("record_notification_token_success", { _token: token });
            break;
          }
          lastError = `fcm_${response.status}`;
          const tokenPermanent = permanentTokenFailure(response.status, responseText);
          if (tokenPermanent) {
            await admin.rpc("record_notification_token_failure", { _token: token, _error_code: lastError, _http_status: response.status, _permanent: true });
            invalidated += 1;
          } else {
            await admin.rpc("record_notification_token_failure", { _token: token, _error_code: lastError, _http_status: response.status, _permanent: false });
          }
          if (permanentProviderFailure(response.status)) {
            providerFailures += 1;
            await admin.rpc("record_push_provider_failure", { _provider: PROVIDER, _error_code: lastError, _http_status: response.status, _permanent: true });
            break;
          }
        } catch {
          lastError = "fcm_timeout_or_network_error";
          providerFailures += 1;
          await admin.rpc("record_push_provider_failure", { _provider: PROVIDER, _error_code: lastError, _http_status: null, _permanent: false });
        }
      }

      if (delivered) {
        const { data: completed, error: completeError } = await admin.rpc("complete_push_delivery", { _id: job.id, _provider_message_id: providerMessageId });
        if (completeError || completed !== true) { failed += 1; continue; }
        sent += 1;
        await admin.rpc("record_push_provider_success", { _provider: PROVIDER });
      } else {
        failed += 1;
        await admin.rpc("fail_push_delivery", { _id: job.id, _error_code: lastError, _retry_after_seconds: retryDelaySeconds(job.attempt_count) });
        if (!permanentProviderFailure(lastHttpStatus ?? 0) && lastError.startsWith("fcm_") && lastHttpStatus !== 404) {
          await admin.rpc("record_push_provider_failure", { _provider: PROVIDER, _error_code: lastError, _http_status: lastHttpStatus, _permanent: false });
        }
      }
    }

    return json({ ok: failed === 0, claimed: jobs.length, sent, failed, no_token: noToken, invalidated_tokens: invalidated, provider_failures: providerFailures, worker_id: workerId, provider_state: circuit.state }, 200, requestId);
  } catch (error) {
    console.error("[APOIS PUSH OUTBOX]", requestId, error instanceof Error ? error.message : "unknown");
    return json({ error: "push_worker_failed" }, 500, requestId);
  }
});
