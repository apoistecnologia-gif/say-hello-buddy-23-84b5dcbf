import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { importPKCS8, SignJWT } from "npm:jose@5.9.6";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FIREBASE_B64 = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_B64") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type PushBody = {
  user_ids: string[];
  event: string;
  title: string;
  body?: string;
  url?: string;
  ride_id?: string;
  data?: Record<string, string>;
};

function readServiceAccount(): ServiceAccount {
  if (!FIREBASE_B64) throw new Error("firebase_secret_missing");
  return JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(FIREBASE_B64), (c) => c.charCodeAt(0)),
    ),
  );
}

async function accessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(account.private_key, "RS256");
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.client_email)
    .setSubject(account.client_email)
    .setAudience(account.token_uri ?? "https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const response = await fetch(
    account.token_uri ?? "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    },
  );
  const result = await response.json();
  if (!response.ok || !result.access_token)
    throw new Error(`firebase_oauth_failed:${JSON.stringify(result)}`);
  return result.access_token;
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS")
      return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST")
      return json({ error: "method_not_allowed" }, 405);
    const authorization = req.headers.get("Authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });
    const serviceRequest = token === SERVICE_ROLE;
    let callerId: string | null = null;
    if (!serviceRequest) {
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) return json({ error: "unauthorized" }, 401);
      callerId = data.user.id;
    }

    const input = (await req.json()) as PushBody;
    const userIds = [
      ...new Set(
        (input.user_ids ?? []).filter(
          (id) => typeof id === "string" && id.length > 20,
        ),
      ),
    ].slice(0, 50);
    if (!userIds.length || !input.event || !input.title)
      return json({ error: "invalid_payload" }, 422);

    if (!serviceRequest) {
      if (!input.ride_id) return json({ error: "ride_required" }, 403);
      const { data: ride } = await admin
        .from("rides")
        .select(
          "passenger_id,driver_id,candidate_driver_ids,offered_driver_ids",
        )
        .eq("id", input.ride_id)
        .maybeSingle();
      if (!ride) return json({ error: "ride_not_found" }, 404);
      const participants = new Set(
        [
          ride.passenger_id,
          ride.driver_id,
          ...((ride.candidate_driver_ids ?? []) as string[]),
          ...((ride.offered_driver_ids ?? []) as string[]),
        ].filter(Boolean),
      );
      if (
        !callerId ||
        !participants.has(callerId) ||
        userIds.some((id) => !participants.has(id))
      ) {
        return json({ error: "forbidden" }, 403);
      }
    }

    const { data: preferences } = await admin
      .from("user_notification_preferences")
      .select("user_id,ride_updates,ride_requests")
      .in("user_id", userIds);
    const preferenceMap = new Map(
      (preferences ?? []).map((p) => [p.user_id, p]),
    );
    const requestEvent = input.event === "driver.new_ride_request";
    const allowedUsers = userIds.filter((id) => {
      const pref = preferenceMap.get(id);
      return requestEvent
        ? pref?.ride_requests !== false
        : pref?.ride_updates !== false;
    });
    if (!allowedUsers.length)
      return json({ ok: true, sent: 0, suppressed: userIds.length });

    const { data: tokenRows, error: tokenError } = await admin
      .from("user_notification_tokens")
      .select("user_id,token")
      .in("user_id", allowedUsers)
      .eq("platform", "android");
    if (tokenError) throw tokenError;
    if (!tokenRows?.length)
      return json({ ok: true, sent: 0, no_tokens: allowedUsers.length });

    const account = readServiceAccount();
    const bearer = await accessToken(account);
    let sent = 0;
    const failures: string[] = [];
    for (const row of tokenRows) {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${bearer}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token: row.token,
              notification: { title: input.title, body: input.body ?? "" },
              data: {
                event: input.event,
                url: input.url ?? "",
                ride_id: input.ride_id ?? "",
                ...(input.data ?? {}),
              },
              android: {
                priority: "high",
                notification: { channel_id: "movvi_rides", sound: "default" },
              },
            },
          }),
        },
      );
      if (response.ok) sent += 1;
      else failures.push(`${row.user_id}:${response.status}`);
    }
    await admin.from("notification_logs").insert(
      allowedUsers.map((userId) => ({
        user_id: userId,
        event: input.event,
        channel: "fcm",
        title: input.title,
        body: input.body ?? null,
        data: { ride_id: input.ride_id ?? null, url: input.url ?? null },
        status: failures.length ? "partial" : "sent",
        error: failures.length ? failures.join(",") : null,
      })),
    );
    return json({ ok: failures.length === 0, sent, failed: failures.length });
  } catch (error) {
    console.error("[MOVVI FCM]", error);
    return json(
      {
        error: "push_failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
