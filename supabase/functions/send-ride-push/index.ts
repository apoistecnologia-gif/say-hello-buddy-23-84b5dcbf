import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { importPKCS8, SignJWT } from "npm:jose@5.9.6";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
const FIREBASE_B64 = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_B64")?.trim() ?? "";
const MAX_BODY_BYTES = 32_768;
const MAX_RECIPIENTS = 100;
const MAX_DATA_FIELDS = 20;
const REQUEST_TIMEOUT_MS = 12_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_RE = /^[a-z0-9_.-]{3,80}$/;

type JsonMap = Record<string, unknown>;
type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
};
type PushBody = {
  user_ids?: string[];
  event: string;
  title?: string;
  body?: string;
  url?: string;
  ride_id?: string;
  data?: Record<string, string>;
};
type RideRow = { passenger_id: string; driver_id: string | null; status: string };
type TokenRow = { user_id: string; token: string };

const CLIENT_EVENT_RULES: Record<string, {
  actor: "driver" | "participant";
  statuses: string[];
  title: string;
  body: string;
}> = {
  "ride.accepted": { actor: "driver", statuses: ["motorista_a_caminho"], title: "Corrida aceita", body: "Um motorista aceitou sua solicitação." },
  "ride.driver_arrived": { actor: "driver", statuses: ["motorista_chegou"], title: "Motorista no local", body: "Seu motorista chegou ao ponto de embarque." },
  "ride.started": { actor: "driver", statuses: ["em_viagem"], title: "Corrida iniciada", body: "Sua viagem começou. Tenha um bom trajeto!" },
  "ride.completed": { actor: "driver", statuses: ["finalizada"], title: "Corrida finalizada", body: "Você chegou ao seu destino." },
  "ride.cancelled": { actor: "participant", statuses: ["cancelada_passageiro", "cancelada_motorista"], title: "Corrida cancelada", body: "A solicitação de corrida foi cancelada." },
};

function secureHeaders(req: Request, requestId: string) {
  return {
    ...getCorsHeaders(req),
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    pragma: "no-cache",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "x-request-id": requestId,
  };
}

function json(req: Request, requestId: string, body: unknown, status = 200) {
  return new Response(JSON.stringify({ request_id: requestId, ...((body && typeof body === "object") ? body as object : { result: body }) }), {
    status,
    headers: secureHeaders(req, requestId),
  });
}

function asObject(value: unknown): JsonMap | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonMap : null;
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  return normalized && normalized.length <= max ? normalized : null;
}

function safeData(value: unknown): Record<string, string> | null {
  if (value === undefined) return {};
  const object = asObject(value);
  if (!object || Object.keys(object).length > MAX_DATA_FIELDS) return null;
  const output: Record<string, string> = {};
  for (const [key, raw] of Object.entries(object)) {
    if (!/^[a-zA-Z0-9_.-]{1,60}$/.test(key) || typeof raw !== "string" || raw.length > 500) return null;
    output[key] = raw;
  }
  return output;
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
  if (!account.project_id || !account.client_email || !account.private_key) throw new Error("firebase_secret_invalid");
  if (!/^[a-z0-9-]{4,100}$/i.test(account.project_id)) throw new Error("firebase_project_invalid");
  return account as ServiceAccount;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function accessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = account.token_uri ?? "https://oauth2.googleapis.com/token";
  if (!tokenUri.startsWith("https://")) throw new Error("firebase_token_uri_invalid");
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
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) throw new Error(`firebase_oauth_failed:${response.status}`);
  const result = await response.json().catch(() => ({}));
  if (typeof result.access_token !== "string" || !result.access_token) throw new Error("firebase_token_missing");
  return result.access_token;
}

function isPermanentTokenFailure(status: number, responseText: string): boolean {
  return status === 404 || responseText.includes("UNREGISTERED") || responseText.includes("INVALID_ARGUMENT");
}

Deno.serve(async (req) => {
  const incomingRequestId = req.headers.get("x-request-id")?.trim() ?? "";
  const requestId = /^[a-zA-Z0-9_-]{8,80}$/.test(incomingRequestId) ? incomingRequestId : crypto.randomUUID();

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: secureHeaders(req, requestId) });
  if (req.method !== "POST") return json(req, requestId, { error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE) return json(req, requestId, { error: "service_unavailable" }, 503);

  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) return json(req, requestId, { error: "unsupported_media_type" }, 415);
  const declaredLength = req.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_BODY_BYTES)) {
    return json(req, requestId, { error: "payload_too_large" }, 413);
  }

  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const authMatch = authHeader.match(/^Bearer\s+([^\s]+)$/i);
    if (!authMatch) return json(req, requestId, { error: "unauthorized" }, 401);
    const token = authMatch[1];

    const rawBody = await req.text();
    if (!rawBody || new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return json(req, requestId, { error: rawBody ? "payload_too_large" : "empty_body" }, rawBody ? 413 : 400);
    }
    let parsed: unknown;
    try { parsed = JSON.parse(rawBody); } catch { return json(req, requestId, { error: "invalid_json" }, 400); }
    const object = asObject(parsed);
    if (!object) return json(req, requestId, { error: "invalid_payload" }, 422);

    const event = cleanText(object.event, 80);
    if (!event || !EVENT_RE.test(event)) return json(req, requestId, { error: "invalid_event" }, 422);
    const customData = safeData(object.data);
    if (customData === null) return json(req, requestId, { error: "invalid_data" }, 422);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
    const isServiceRequest = token === SERVICE_ROLE;
    let isAdmin = false;
    let callerId: string | null = null;

    if (!isServiceRequest) {
      const { data: userData, error: authError } = await admin.auth.getUser(token);
      if (authError || !userData.user) return json(req, requestId, { error: "unauthorized" }, 401);
      callerId = userData.user.id;
      const { data: roleData, error: roleError } = await admin
        .from("user_roles").select("role").eq("user_id", callerId).in("role", ["admin", "super_admin"]);
      if (roleError) throw new Error("role_lookup_failed");
      isAdmin = (roleData?.length ?? 0) > 0;
    }

    let finalUserIds: string[] = [];
    let finalTitle = "";
    let finalBody = "";
    const finalUrl = cleanText(object.url, 500) ?? "";
    const rideId = cleanText(object.ride_id, 36);

    if (isServiceRequest || isAdmin) {
      if (!Array.isArray(object.user_ids)) return json(req, requestId, { error: "invalid_user_ids" }, 422);
      const userIds = object.user_ids.filter((id): id is string => typeof id === "string" && UUID_RE.test(id));
      if (userIds.length !== object.user_ids.length) return json(req, requestId, { error: "invalid_user_ids" }, 422);
      finalUserIds = [...new Set(userIds)].slice(0, MAX_RECIPIENTS);
      finalTitle = cleanText(object.title, 100) ?? "";
      finalBody = cleanText(object.body ?? "", 500) ?? "";
      if (!finalUserIds.length || !finalTitle) return json(req, requestId, { error: "admin_payload_incomplete" }, 422);
    } else {
      if (!rideId || !UUID_RE.test(rideId) || !callerId) return json(req, requestId, { error: "invalid_payload" }, 422);
      const rule = CLIENT_EVENT_RULES[event];
      if (!rule) return json(req, requestId, { error: "event_not_allowed" }, 403);
      const { data, error: rideError } = await admin
        .from("rides").select("passenger_id,driver_id,status").eq("id", rideId).maybeSingle();
      if (rideError) throw new Error("ride_lookup_failed");
      if (!data) return json(req, requestId, { error: "ride_not_found" }, 404);
      const ride = data as RideRow;
      const isPassenger = callerId === ride.passenger_id;
      const isDriver = callerId === ride.driver_id;
      if (!(rule.actor === "driver" ? isDriver : isPassenger || isDriver)) return json(req, requestId, { error: "forbidden" }, 403);
      if (!rule.statuses.includes(ride.status)) return json(req, requestId, { error: "event_status_mismatch" }, 409);
      finalUserIds = isDriver ? [ride.passenger_id] : ride.driver_id ? [ride.driver_id] : [];
      finalTitle = rule.title;
      finalBody = rule.body;
      if (!finalUserIds.length) return json(req, requestId, { ok: true, sent: 0, reason: "no_recipients_derived" });
    }

    const { data: preferences, error: preferencesError } = await admin
      .from("user_notification_preferences").select("user_id,ride_updates,ride_requests").in("user_id", finalUserIds);
    if (preferencesError) throw new Error("notification_preferences_lookup_failed");
    const prefMap = new Map((preferences ?? []).map((preference) => [preference.user_id, preference]));
    const requestEvent = event === "driver.new_ride_request";
    const allowedUsers = finalUserIds.filter((userId) => {
      const preference = prefMap.get(userId);
      return !preference || (requestEvent ? preference.ride_requests !== false : preference.ride_updates !== false);
    });
    if (!allowedUsers.length) return json(req, requestId, { ok: true, sent: 0, suppressed: finalUserIds.length });

    const { data: tokenRows, error: tokenError } = await admin
      .from("user_notification_tokens").select("user_id,token").in("user_id", allowedUsers).eq("platform", "android");
    if (tokenError) throw new Error("notification_token_lookup_failed");
    const uniqueTokens = [...new Map(((tokenRows ?? []) as TokenRow[]).filter((row) => row.token).map((row) => [row.token, row])).values()];
    if (!uniqueTokens.length) return json(req, requestId, { ok: true, sent: 0, no_tokens: allowedUsers.length });

    const account = readServiceAccount();
    const bearer = await accessToken(account);
    let sent = 0;
    const failedUsers = new Set<string>();
    const invalidTokens = new Set<string>();

    for (let index = 0; index < uniqueTokens.length; index += 10) {
      const chunk = uniqueTokens.slice(index, index + 10);
      const results = await Promise.all(chunk.map(async (row) => {
        try {
          const response = await fetchWithTimeout(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
            method: "POST",
            headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
            body: JSON.stringify({ message: {
              token: row.token,
              notification: { title: finalTitle, body: finalBody },
              data: { event, url: finalUrl, ride_id: rideId ?? "", ...customData },
              android: { priority: "high", ttl: "120s", notification: { channel_id: "apois_rides", sound: "default", visibility: "private" } },
            } }),
          });
          const responseText = response.ok ? "" : await response.text();
          return { row, ok: response.ok, permanent: !response.ok && isPermanentTokenFailure(response.status, responseText) };
        } catch {
          return { row, ok: false, permanent: false };
        }
      }));
      for (const result of results) {
        if (result.ok) sent += 1;
        else failedUsers.add(result.row.user_id);
        if (result.permanent) invalidTokens.add(result.row.token);
      }
    }

    if (invalidTokens.size) {
      const { error: deleteError } = await admin.from("user_notification_tokens").delete().in("token", [...invalidTokens]);
      if (deleteError) console.error("[APOIS FCM] invalid_token_cleanup_failed", requestId);
    }

    const { error: logError } = await admin.from("notification_logs").insert(allowedUsers.map((userId) => ({
      user_id: userId,
      event,
      channel: "fcm",
      title: finalTitle,
      body: finalBody || null,
      data: { ride_id: rideId ?? null, url: finalUrl || null, request_id: requestId },
      status: failedUsers.has(userId) ? "failed" : "sent",
    })));
    if (logError) console.error("[APOIS FCM] notification_log_failed", requestId);

    return json(req, requestId, {
      ok: failedUsers.size === 0,
      sent,
      failed: failedUsers.size,
      invalid_tokens_removed: invalidTokens.size,
      recipients: allowedUsers.length,
    });
  } catch (error) {
    console.error("[APOIS FCM] fatal", requestId, error instanceof Error ? error.message : "unknown");
    return json(req, requestId, { error: "push_failed" }, 500);
  }
});
