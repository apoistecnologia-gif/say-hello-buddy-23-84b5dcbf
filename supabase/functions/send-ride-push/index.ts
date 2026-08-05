import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { importPKCS8, SignJWT } from "npm:jose@5.9.6";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FIREBASE_B64 = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_B64") ?? "";

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 
      ...getCorsHeaders(req), 
      "content-type": "application/json" 
    },
  });
}

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

const ALLOWED_EVENTS = [
  "driver.new_ride_request",
  "ride.accepted",
  "ride.driver_arrived",
  "ride.started",
  "ride.completed",
  "ride.cancelled",
  "ride.payment_confirmed",
];

function readServiceAccount(): ServiceAccount {
  if (!FIREBASE_B64) throw new Error("firebase_secret_missing");
  return JSON.parse(
    new TextDecoder().decode(Uint8Array.from(atob(FIREBASE_B64), (c) => c.charCodeAt(0))),
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
  const response = await fetch(account.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`firebase_oauth_failed:${response.status}`);
  const result = await response.json();
  if (!result.access_token) throw new Error("firebase_token_missing");
  return result.access_token;
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
    if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

    const authorization = req.headers.get("Authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json(req, { error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    const isServiceRequest = token === SERVICE_ROLE;
    let isAdmin = false;
    let callerId: string | null = null;

    if (!isServiceRequest) {
      const { data: userData, error: authError } = await admin.auth.getUser(token);
      if (authError || !userData.user) return json(req, { error: "unauthorized" }, 401);
      callerId = userData.user.id;

      const { data: roleData } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", callerId)
        .in("role", ["admin", "super_admin"])
        .maybeSingle();
      if (roleData) isAdmin = true;
    }

    const input = (await req.json()) as PushBody;
    if (!input.event || (!isAdmin && !isServiceRequest && !input.ride_id)) {
      return json(req, { error: "invalid_payload" }, 422);
    }

    let finalUserIds: string[] = [];
    let finalTitle = "";
    let finalBody = "";
    let finalUrl = input.url ?? "";
    let finalData = input.data ?? {};

    if (isServiceRequest || isAdmin) {
      if (!input.user_ids?.length || !input.title) return json(req, { error: "admin_payload_incomplete" }, 422);
      finalUserIds = [...new Set(input.user_ids)].slice(0, 100);
      finalTitle = input.title.slice(0, 100);
      finalBody = (input.body ?? "").slice(0, 500);
    } else {
      if (!ALLOWED_EVENTS.includes(input.event)) return json(req, { error: "event_not_allowed" }, 403);
      
      const { data: ride, error: rideError } = await admin
        .from("rides")
        .select("passenger_id,driver_id,candidate_driver_ids,offered_driver_ids,status")
        .eq("id", input.ride_id)
        .maybeSingle();

      if (rideError || !ride) return json(req, { error: "ride_not_found" }, 404);

      const participants = new Set([
        ride.passenger_id,
        ride.driver_id,
        ...((ride.candidate_driver_ids ?? []) as string[]),
        ...((ride.offered_driver_ids ?? []) as string[]),
      ].filter(Boolean));

      if (!callerId || !participants.has(callerId)) return json(req, { error: "forbidden" }, 403);

      // Recipient logic based on event
      if (input.event === "driver.new_ride_request") {
        finalUserIds = ((ride.offered_driver_ids ?? []) as string[]).filter(id => id !== callerId);
        finalTitle = "Nova solicitação de corrida";
        finalBody = "Uma nova corrida está disponível próxima a você.";
      } else if (input.event.startsWith("ride.")) {
        // Broadly: if passenger sends, notify driver. If driver sends, notify passenger.
        if (callerId === ride.passenger_id && ride.driver_id) {
          finalUserIds = [ride.driver_id];
        } else if (callerId === ride.driver_id) {
          finalUserIds = [ride.passenger_id];
        }
        
        const eventMap: Record<string, { title: string, body: string }> = {
          "ride.accepted": { title: "Corrida Aceita", body: "Um motorista aceitou sua solicitação." },
          "ride.driver_arrived": { title: "Motorista no Local", body: "Seu motorista chegou ao ponto de embarque." },
          "ride.started": { title: "Corrida Iniciada", body: "Sua viagem começou. Tenha um bom trajeto!" },
          "ride.completed": { title: "Corrida Finalizada", body: "Você chegou ao seu destino." },
          "ride.cancelled": { title: "Corrida Cancelada", body: "A solicitação de corrida foi cancelada." },
          "ride.payment_confirmed": { title: "Pagamento Confirmado", body: "Obrigado por utilizar o APOIS!" },
        };
        const content = eventMap[input.event];
        if (content) {
          finalTitle = content.title;
          finalBody = content.body;
        }
      }

      if (!finalUserIds.length) return json(req, { ok: true, sent: 0, reason: "no_recipients_derived" }, 200);
    }

    // Filter by preferences
    const { data: preferences } = await admin
      .from("user_notification_preferences")
      .select("user_id,ride_updates,ride_requests")
      .in("user_id", finalUserIds);
    
    const prefMap = new Map((preferences ?? []).map(p => [p.user_id, p]));
    const isRequestEvent = input.event === "driver.new_ride_request";
    const allowedUsers = finalUserIds.filter(id => {
      const p = prefMap.get(id);
      if (!p) return true; // Default to true if no preference set
      return isRequestEvent ? p.ride_requests !== false : p.ride_updates !== false;
    });

    if (!allowedUsers.length) return json(req, { ok: true, sent: 0, suppressed: finalUserIds.length }, 200);

    const { data: tokenRows } = await admin
      .from("user_notification_tokens")
      .select("user_id,token")
      .in("user_id", allowedUsers)
      .eq("platform", "android");

    if (!tokenRows?.length) return json(req, { ok: true, sent: 0, no_tokens: allowedUsers.length }, 200);

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
              notification: { title: finalTitle, body: finalBody },
              data: {
                event: input.event,
                url: finalUrl,
                ride_id: input.ride_id ?? "",
                ...finalData,
              },
              android: {
                priority: "high",
                notification: { channel_id: "apois_rides", sound: "default" },
              },
            },
          }),
        },
      );
      if (response.ok) sent++;
      else failures.push(`${row.user_id}:${response.status}`);
    }

    await admin.from("notification_logs").insert(
      allowedUsers.map(uid => ({
        user_id: uid,
        event: input.event,
        channel: "fcm",
        title: finalTitle,
        body: finalBody || null,
        data: { ride_id: input.ride_id ?? null, url: finalUrl || null },
        status: failures.some(f => f.startsWith(uid)) ? "failed" : "sent",
      }))
    );

    return json(req, { ok: failures.length === 0, sent, failed: failures.length }, 200);
  } catch (error) {
    console.error("[APOIS FCM]", error);
    return json(req, { error: "push_failed" }, 500);
  }
});
