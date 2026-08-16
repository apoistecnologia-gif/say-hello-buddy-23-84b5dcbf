import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(req ? getCorsHeaders(req) : {}),
      "content-type": "application/json",
    },
  });
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, req);

  const token = (req.headers.get("Authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) return json({ error: "unauthorized" }, 401, req);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const authUser = authData.user;
  if (authError || !authUser) return json({ error: "unauthorized" }, 401, req);

  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("id,deleted_at")
    .or(`auth_user_id.eq.${authUser.id},id.eq.${authUser.id}`)
    .limit(1)
    .maybeSingle();
  if (profileError || !profile || profile.deleted_at) {
    return json({ error: "passenger_profile_missing" }, 404, req);
  }

  let input: Record<string, unknown> = {};
  try {
    const parsed = await req.json();
    input = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return json({ error: "invalid_json" }, 400, req);
  }

  const allowedCategories = new Set(["ride", "payment", "account", "safety", "other"]);
  const category = clean(input["category"], 30);
  const subject = clean(input["subject"], 120);
  const message = clean(input["message"], 2000);
  const rideId = clean(input["rideId"], 60);

  if (!allowedCategories.has(category) || subject.length < 5 || message.length < 10) {
    return json(
      {
        error: "invalid_ticket",
        message: "Informe o assunto, a categoria e uma descrição mais detalhada.",
      },
      422,
      req,
    );
  }

  let safeRideId: string | null = null;
  if (rideId) {
    if (!isUuid(rideId)) return json({ error: "invalid_ride_id" }, 422, req);
    const { data: ride } = await admin
      .from("rides")
      .select("id")
      .eq("id", rideId)
      .eq("passenger_id", profile.id)
      .maybeSingle();
    if (!ride) return json({ error: "ride_not_found" }, 404, req);
    safeRideId = ride.id;
  }

  const priority = category === "safety" ? "high" : "normal";
  const ticketId = crypto.randomUUID();
  const protocol = `APOIS-${ticketId.replace(/-/g, "").slice(0, 16).toUpperCase()}`;
  const { data: ticket, error: ticketError } = await admin
    .from("passenger_support_tickets")
    .insert({
      id: ticketId,
      protocol,
      passenger_id: profile.id,
      category,
      subject,
      message,
      ride_id: safeRideId,
      priority,
      status: "open",
    })
    .select("id,protocol,created_at,status")
    .single();

  if (ticketError || !ticket) {
    console.error("[passenger-support] ticket creation failed", ticketError);
    return json({ error: "ticket_creation_failed" }, 500, req);
  }

  await admin.from("notifications").insert({
    user_id: profile.id,
    title: "Atendimento registrado",
    body: `Seu protocolo ${ticket.protocol} foi aberto e será analisado.`,
    data: {
      category: "support",
      ticket_id: ticket.id,
      protocol: ticket.protocol,
      url: "/perfil",
    },
  });

  return json(
    {
      ok: true,
      ticket: {
        id: ticket.id,
        protocol: ticket.protocol,
        status: ticket.status,
        createdAt: ticket.created_at,
      },
    },
    201,
    req,
  );
});
