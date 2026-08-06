import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { importPKCS8, SignJWT } from "npm:jose@5.9.6";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FIREBASE_B64 = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_B64") ?? "";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AdminClient = ReturnType<typeof createClient>;

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type PushBody = {
  user_ids?: string[];
  event?: string;
  title?: string;
  body?: string;
  url?: string;
  ride_id?: string;
  data?: Record<string, string>;
};

type RideRow = {
  passenger_id: string;
  driver_id: string | null;
  status: string;
};

type CallerIdentity = {
  authUserId: string;
  profileId: string | null;
  driverId: string | null;
  isAdmin: boolean;
};

const CLIENT_EVENT_RULES: Record<
  string,
  { actor: "driver" | "participant"; statuses: string[]; title: string; body: string }
> = {
  "ride.accepted": {
    actor: "driver",
    statuses: ["motorista_a_caminho"],
    title: "Corrida aceita",
    body: "Um motorista aceitou sua solicitação.",
  },
  "ride.driver_arrived": {
    actor: "driver",
    statuses: ["motorista_chegou"],
    title: "Motorista no local",
    body: "Seu motorista chegou ao ponto de embarque.",
  },
  "ride.started": {
    actor: "driver",
    statuses: ["em_viagem"],
    title: "Corrida iniciada",
    body: "Sua viagem começou. Tenha um bom trajeto!",
  },
  "ride.completed": {
    actor: "driver",
    statuses: ["finalizada"],
    title: "Corrida finalizada",
    body: "Você chegou ao seu destino.",
  },
  "ride.cancelled": {
    actor: "participant",
    statuses: ["cancelada_passageiro", "cancelada_motorista"],
    title: "Corrida cancelada",
    body: "A solicitação de corrida foi cancelada.",
  },
};

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "content-type": "application/json" },
  });
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function uniqueUuids(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values
        .map((value) => cleanText(value, 80))
        .filter((value) => UUID_PATTERN.test(value)),
    ),
  ].slice(0, 100);
}

function readServiceAccount(): ServiceAccount {
  if (!FIREBASE_B64) throw new Error("firebase_secret_missing");

  const account = JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(FIREBASE_B64), (character) => character.charCodeAt(0)),
    ),
  ) as Partial<ServiceAccount>;

  if (
    !account.project_id ||
    !account.client_email ||
    !account.private_key?.includes("BEGIN PRIVATE KEY")
  ) {
    throw new Error("firebase_service_account_invalid");
  }

  return account as ServiceAccount;
}

async function accessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = account.token_uri ?? "https://oauth2.googleapis.com/token";
  const key = await importPKCS8(account.private_key, "RS256");
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.client_email)
    .setSubject(account.client_email)
    .setAudience(tokenUri)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const payload = await response.json().catch(() => ({})) as { access_token?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(`firebase_oauth_failed:${response.status}`);
  }
  return payload.access_token;
}

async function resolveCaller(
  admin: AdminClient,
  authUserId: string,
): Promise<CallerIdentity> {
  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("id")
    .eq("auth_user_id", authUserId)
    .is("deleted_at", null)
    .maybeSingle();
  if (profileError) throw new Error(`caller_profile_lookup_failed:${profileError.message}`);

  let driverId: string | null = null;
  let mobilityAdmin = false;
  if (profile?.id) {
    const [driverResult, roleResult] = await Promise.all([
      admin.from("drivers").select("id").eq("user_id", profile.id).maybeSingle(),
      admin
        .from("user_roles")
        .select("role")
        .eq("user_id", profile.id)
        .eq("role", "admin")
        .maybeSingle(),
    ]);
    if (driverResult.error) {
      throw new Error(`caller_driver_lookup_failed:${driverResult.error.message}`);
    }
    driverId = driverResult.data?.id ?? null;
    mobilityAdmin = Boolean(roleResult.data);
  }

  const { data: siteProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("user_id", authUserId)
    .eq("role", "administrator")
    .maybeSingle();

  return {
    authUserId,
    profileId: profile?.id ?? null,
    driverId,
    isAdmin: mobilityAdmin || Boolean(siteProfile),
  };
}

/**
 * Aceita IDs operacionais de public.users e, por compatibilidade controlada,
 * converte UUIDs de auth.users ou drivers para o respectivo public.users.id.
 */
async function normalizeRecipientIds(
  admin: AdminClient,
  rawIds: unknown,
): Promise<string[]> {
  const ids = uniqueUuids(rawIds);
  if (!ids.length) return [];

  const [directUsers, authUsers, driverRows] = await Promise.all([
    admin.from("users").select("id").in("id", ids).is("deleted_at", null),
    admin.from("users").select("id").in("auth_user_id", ids).is("deleted_at", null),
    admin.from("drivers").select("user_id").in("id", ids),
  ]);

  if (directUsers.error) throw new Error(`recipient_lookup_failed:${directUsers.error.message}`);
  if (authUsers.error) throw new Error(`recipient_auth_lookup_failed:${authUsers.error.message}`);
  if (driverRows.error) throw new Error(`recipient_driver_lookup_failed:${driverRows.error.message}`);

  return [
    ...new Set([
      ...(directUsers.data ?? []).map((row) => String(row.id)),
      ...(authUsers.data ?? []).map((row) => String(row.id)),
      ...(driverRows.data ?? []).map((row) => String(row.user_id)),
    ]),
  ].slice(0, 100);
}

async function driverProfileId(
  admin: AdminClient,
  driverId: string | null,
): Promise<string | null> {
  if (!driverId) return null;
  const { data, error } = await admin
    .from("drivers")
    .select("user_id")
    .eq("id", driverId)
    .maybeSingle();
  if (error) throw new Error(`ride_driver_lookup_failed:${error.message}`);
  return data?.user_id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return json(req, { error: "server_configuration_missing" }, 500);
    }

    const bearerToken = (req.headers.get("Authorization") ?? "")
      .replace(/^Bearer\s+/i, "")
      .trim();
    if (!bearerToken) return json(req, { error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const isServiceRequest = bearerToken === SERVICE_ROLE;
    let caller: CallerIdentity | null = null;

    if (!isServiceRequest) {
      const { data: authData, error: authError } = await admin.auth.getUser(bearerToken);
      if (authError || !authData.user) return json(req, { error: "unauthorized" }, 401);
      caller = await resolveCaller(admin, authData.user.id);
    }

    let input: PushBody;
    try {
      input = await req.json() as PushBody;
    } catch {
      return json(req, { error: "invalid_json" }, 400);
    }

    const event = cleanText(input.event, 80);
    if (!event) return json(req, { error: "invalid_payload" }, 422);

    if (event === "diagnostics.readiness") {
      if (!isServiceRequest && !caller?.isAdmin) {
        return json(req, { error: "forbidden" }, 403);
      }

      let accountValid = false;
      let firebaseProjectId: string | null = null;
      try {
        const account = readServiceAccount();
        accountValid = true;
        firebaseProjectId = account.project_id;
      } catch {
        accountValid = false;
      }

      const { count: activeTokens, error: tokenCountError } = await admin
        .from("user_notification_tokens")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .in("permission_status", ["granted", "provisional"]);
      if (tokenCountError) {
        throw new Error(`notification_token_count_failed:${tokenCountError.message}`);
      }

      return json(req, {
        ok: true,
        mode: "readiness",
        sent: 0,
        firebase_secret_present: FIREBASE_B64.length > 0,
        service_account_parsable: accountValid,
        firebase_project_id: firebaseProjectId,
        android_channel_id: "apois_rides",
        active_device_tokens: activeTokens ?? 0,
      });
    }

    let finalUserIds: string[] = [];
    let finalTitle = "";
    let finalBody = "";
    const finalUrl = cleanText(input.url, 300);
    const finalData = input.data && typeof input.data === "object" ? input.data : {};
    const rideId = cleanText(input.ride_id, 80);

    if (isServiceRequest || caller?.isAdmin) {
      if (!input.user_ids?.length || !input.title) {
        return json(req, { error: "admin_payload_incomplete" }, 422);
      }
      finalUserIds = await normalizeRecipientIds(admin, input.user_ids);
      finalTitle = cleanText(input.title, 100);
      finalBody = cleanText(input.body, 500);
    } else {
      if (!caller?.profileId || !rideId || !UUID_PATTERN.test(rideId)) {
        return json(req, { error: "invalid_payload" }, 422);
      }

      const rule = CLIENT_EVENT_RULES[event];
      if (!rule) return json(req, { error: "event_not_allowed" }, 403);

      const { data, error: rideError } = await admin
        .from("rides")
        .select("passenger_id,driver_id,status")
        .eq("id", rideId)
        .maybeSingle();
      if (rideError || !data) return json(req, { error: "ride_not_found" }, 404);

      const ride = data as RideRow;
      const isPassenger = caller.profileId === ride.passenger_id;
      const isDriver = Boolean(caller.driverId && caller.driverId === ride.driver_id);
      const actorAllowed = rule.actor === "driver" ? isDriver : isPassenger || isDriver;
      if (!actorAllowed) return json(req, { error: "forbidden" }, 403);
      if (!rule.statuses.includes(ride.status)) {
        return json(req, { error: "event_status_mismatch" }, 409);
      }

      if (isDriver) {
        finalUserIds = [ride.passenger_id];
      } else if (isPassenger) {
        const recipient = await driverProfileId(admin, ride.driver_id);
        finalUserIds = recipient ? [recipient] : [];
      }

      finalTitle = rule.title;
      finalBody = rule.body;
      if (!finalUserIds.length) {
        return json(req, { ok: true, sent: 0, reason: "no_recipients_derived" });
      }
    }

    finalUserIds = [...new Set(finalUserIds)].slice(0, 100);
    if (!finalUserIds.length) {
      return json(req, { ok: true, sent: 0, reason: "no_valid_recipients" });
    }

    const { data: preferences, error: preferenceError } = await admin
      .from("user_notification_preferences")
      .select("user_id,ride_updates,ride_requests")
      .in("user_id", finalUserIds);
    if (preferenceError) {
      throw new Error(`notification_preferences_failed:${preferenceError.message}`);
    }

    const preferenceMap = new Map(
      (preferences ?? []).map((preference) => [String(preference.user_id), preference]),
    );
    const isRideRequest = event === "driver.new_ride_request";
    const allowedUsers = finalUserIds.filter((userId) => {
      const preference = preferenceMap.get(userId);
      if (!preference) return true;
      return isRideRequest
        ? preference.ride_requests !== false
        : preference.ride_updates !== false;
    });

    if (!allowedUsers.length) {
      return json(req, { ok: true, sent: 0, suppressed: finalUserIds.length });
    }

    const { data: tokenRows, error: tokenError } = await admin
      .from("user_notification_tokens")
      .select("user_id,token")
      .in("user_id", allowedUsers)
      .eq("is_active", true)
      .in("permission_status", ["granted", "provisional"]);
    if (tokenError) {
      throw new Error(`notification_token_lookup_failed:${tokenError.message}`);
    }

    if (!tokenRows?.length) {
      return json(req, { ok: true, sent: 0, no_tokens: allowedUsers.length });
    }

    const account = readServiceAccount();
    const firebaseBearer = await accessToken(account);
    const usersWithTokens = new Set(tokenRows.map((row) => String(row.user_id)));
    const successfulUsers = new Set<string>();
    const failedUsers = new Set<string>();
    let sent = 0;

    for (const row of tokenRows) {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${firebaseBearer}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token: row.token,
              notification: { title: finalTitle, body: finalBody },
              data: {
                event,
                url: finalUrl,
                ride_id: rideId,
                ...finalData,
              },
              android: {
                priority: "high",
                notification: {
                  channel_id: "apois_rides",
                  sound: "default",
                },
              },
            },
          }),
        },
      );

      const userId = String(row.user_id);
      if (response.ok) {
        sent += 1;
        successfulUsers.add(userId);
        continue;
      }

      failedUsers.add(userId);
      const responseText = await response.text().catch(() => "");
      const invalidToken =
        response.status === 404 ||
        responseText.includes("UNREGISTERED") ||
        responseText.includes("registration-token-not-registered");
      if (invalidToken) {
        await admin
          .from("user_notification_tokens")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("token", row.token);
      }
    }

    const logs = allowedUsers.map((userId) => ({
      user_id: userId,
      event,
      channel: "fcm",
      title: finalTitle,
      body: finalBody || null,
      data: { url: finalUrl || null },
      ride_id: rideId && UUID_PATTERN.test(rideId) ? rideId : null,
      status: successfulUsers.has(userId)
        ? "sent"
        : usersWithTokens.has(userId)
          ? "failed"
          : "no_token",
    }));

    const { error: logError } = await admin.from("notification_logs").insert(logs);
    if (logError) {
      console.error("[APOIS FCM] notification_log_failed", logError.message);
    }

    return json(req, {
      ok: failedUsers.size === 0,
      sent,
      failed_users: failedUsers.size,
      recipients: allowedUsers.length,
      no_tokens: allowedUsers.filter((userId) => !usersWithTokens.has(userId)).length,
    });
  } catch (error) {
    console.error("[APOIS FCM]", {
      message: error instanceof Error ? error.message : "push_unknown_error",
    });
    return json(req, { error: "push_failed" }, 500);
  }
});
