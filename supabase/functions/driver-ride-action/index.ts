import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type DriverAction = "accept" | "reject" | "arrive" | "start" | "finish";

type RequestBody = {
  ride_id?: string;
  action?: DriverAction;
  security_code?: string;
  final_price?: number;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(req ? getCorsHeaders(req) : {}),
      "content-type": "application/json",
    },
  });
}

function isAction(value: unknown): value is DriverAction {
  return ["accept", "reject", "arrive", "start", "finish"].includes(String(value));
}

function normalizeCode(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").slice(0, 8);
}

function finitePositive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

async function sendPassengerEvent(
  ride: Record<string, unknown>,
  event: string,
  title: string,
  body: string,
): Promise<void> {
  const passengerId = String(ride.passenger_id ?? "");
  const rideId = String(ride.id ?? "");
  if (!passengerId || !rideId) return;

  const response = await fetch(`${SUPABASE_URL}/functions/v1/send-ride-push`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      user_ids: [passengerId],
      event,
      title,
      body,
      url: `/corrida/${rideId}`,
      ride_id: rideId,
    }),
  });

  if (!response.ok) {
    console.error("[driver-ride-action] push failed", response.status, await response.text());
  }
}

Deno.serve(async (req) => {
  try {
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
    const userId = authData.user?.id;
    if (authError || !userId) {
      return json({ error: "unauthorized", detail: authError?.message }, 401, req);
    }

    const body = (await req.json()) as RequestBody;
    const rideId = String(body.ride_id ?? "").trim();
    if (!UUID_PATTERN.test(rideId)) return json({ error: "invalid_ride_id" }, 422, req);
    if (!isAction(body.action)) return json({ error: "invalid_action" }, 422, req);

    const { data: driver, error: driverError } = await admin
      .from("drivers")
      .select(
        "user_id,name,phone,rating,vehicle_model,vehicle_color,vehicle_plate,approval_status,is_online",
      )
      .eq("user_id", userId)
      .maybeSingle();

    if (driverError) {
      return json({ error: "driver_lookup_failed", detail: driverError.message }, 500, req);
    }
    if (!driver) return json({ error: "driver_not_found" }, 404, req);
    if (driver.approval_status !== "aprovado") {
      return json({ error: "driver_not_approved" }, 403, req);
    }

    const { data: ride, error: rideError } = await admin
      .from("rides")
      .select("*")
      .eq("id", rideId)
      .maybeSingle();

    if (rideError) return json({ error: "ride_lookup_failed", detail: rideError.message }, 500, req);
    if (!ride) return json({ error: "ride_not_found" }, 404, req);

    if (body.action === "reject") {
      if (ride.status !== "procurar_motorista" || ride.driver_id || ride.accepted_driver_id) {
        return json({ ok: true, skipped: "status_changed", status: ride.status }, 200, req);
      }

      const candidates = Array.isArray(ride.candidate_driver_ids)
        ? ride.candidate_driver_ids.map(String)
        : [];
      const offered = Array.isArray(ride.offered_driver_ids)
        ? ride.offered_driver_ids.map(String)
        : [];
      const rejected = new Set(
        Array.isArray(ride.rejected_driver_ids) ? ride.rejected_driver_ids.map(String) : [],
      );

      if (!candidates.includes(userId) && !offered.includes(userId)) {
        return json({ error: "ride_not_offered_to_driver" }, 403, req);
      }

      rejected.add(userId);
      const { error: rejectError } = await admin
        .from("rides")
        .update({
          rejected_driver_ids: Array.from(rejected),
          candidate_driver_ids: candidates.filter((id: string) => id !== userId),
          offered_driver_ids: offered.filter((id: string) => id !== userId),
          current_offer_driver_id:
            String(ride.current_offer_driver_id ?? "") === userId
              ? null
              : ride.current_offer_driver_id,
        })
        .eq("id", rideId)
        .eq("status", "procurar_motorista")
        .is("driver_id", null);

      if (rejectError) {
        return json({ error: "ride_reject_failed", detail: rejectError.message }, 500, req);
      }
      return json({ ok: true, action: "reject", status: "procurar_motorista" }, 200, req);
    }

    if (body.action === "accept") {
      if (ride.status !== "procurar_motorista" || ride.driver_id || ride.accepted_driver_id) {
        if (String(ride.driver_id ?? ride.accepted_driver_id ?? "") === userId) {
          return json({ ok: true, reused: true, action: "accept", status: ride.status }, 200, req);
        }
        return json({ error: "ride_already_taken", status: ride.status }, 409, req);
      }

      const candidates = Array.isArray(ride.candidate_driver_ids)
        ? ride.candidate_driver_ids.map(String)
        : [];
      const offered = Array.isArray(ride.offered_driver_ids)
        ? ride.offered_driver_ids.map(String)
        : [];
      if (!candidates.includes(userId) && !offered.includes(userId)) {
        return json({ error: "ride_not_offered_to_driver" }, 403, req);
      }

      const now = new Date().toISOString();
      const securityCode = String(Math.floor(1000 + Math.random() * 9000));
      const { data: accepted, error: acceptError } = await admin
        .from("rides")
        .update({
          status: "motorista_a_caminho",
          driver_id: userId,
          accepted_driver_id: userId,
          accepted_at: now,
          security_code: securityCode,
          driver_name: driver.name,
          driver_phone: driver.phone,
          driver_rating: driver.rating,
          driver_vehicle_model: driver.vehicle_model,
          driver_vehicle_color: driver.vehicle_color,
          driver_vehicle_plate: driver.vehicle_plate,
          candidate_driver_ids: [],
          offered_driver_ids: [],
          current_offer_driver_id: null,
          request_expires_at: null,
        })
        .eq("id", rideId)
        .eq("status", "procurar_motorista")
        .is("driver_id", null)
        .is("accepted_driver_id", null)
        .select("*")
        .maybeSingle();

      if (acceptError) {
        return json({ error: "ride_accept_failed", detail: acceptError.message }, 500, req);
      }
      if (!accepted) return json({ error: "ride_already_taken" }, 409, req);

      EdgeRuntime.waitUntil(
        sendPassengerEvent(
          accepted,
          "ride.driver_accepted",
          "Motorista a caminho",
          `${driver.name} aceitou sua corrida.`,
        ).catch((error) => console.error("[driver-ride-action] accept push", error)),
      );
      return json({ ok: true, action: "accept", status: accepted.status, ride: accepted }, 200, req);
    }

    if (String(ride.driver_id ?? "") !== userId) {
      return json({ error: "driver_not_assigned" }, 403, req);
    }

    if (body.action === "arrive") {
      if (ride.status === "motorista_chegou") {
        return json({ ok: true, reused: true, action: "arrive", status: ride.status }, 200, req);
      }
      if (ride.status !== "motorista_a_caminho") {
        return json({ error: "invalid_status_transition", status: ride.status }, 409, req);
      }

      const now = new Date().toISOString();
      const { data: arrived, error: arriveError } = await admin
        .from("rides")
        .update({ status: "motorista_chegou", driver_arrived_at: now })
        .eq("id", rideId)
        .eq("driver_id", userId)
        .eq("status", "motorista_a_caminho")
        .select("*")
        .maybeSingle();

      if (arriveError) return json({ error: "ride_arrive_failed", detail: arriveError.message }, 500, req);
      if (!arrived) return json({ error: "status_changed" }, 409, req);

      EdgeRuntime.waitUntil(
        sendPassengerEvent(
          arrived,
          "ride.driver_arrived",
          "O motorista chegou",
          "Seu motorista está no local de embarque.",
        ).catch((error) => console.error("[driver-ride-action] arrive push", error)),
      );
      return json({ ok: true, action: "arrive", status: arrived.status }, 200, req);
    }

    if (body.action === "start") {
      if (ride.status === "em_viagem") {
        return json({ ok: true, reused: true, action: "start", status: ride.status }, 200, req);
      }
      if (ride.status !== "motorista_chegou") {
        return json({ error: "invalid_status_transition", status: ride.status }, 409, req);
      }

      const suppliedCode = normalizeCode(body.security_code);
      const expectedCode = normalizeCode(ride.security_code);
      if (!suppliedCode || !expectedCode || suppliedCode !== expectedCode) {
        return json({ error: "invalid_security_code" }, 422, req);
      }

      const now = new Date().toISOString();
      const { data: started, error: startError } = await admin
        .from("rides")
        .update({ status: "em_viagem", started_at: now })
        .eq("id", rideId)
        .eq("driver_id", userId)
        .eq("status", "motorista_chegou")
        .select("*")
        .maybeSingle();

      if (startError) return json({ error: "ride_start_failed", detail: startError.message }, 500, req);
      if (!started) return json({ error: "status_changed" }, 409, req);

      EdgeRuntime.waitUntil(
        sendPassengerEvent(
          started,
          "ride.started",
          "Viagem iniciada",
          "Acompanhe o trajeto pelo aplicativo.",
        ).catch((error) => console.error("[driver-ride-action] start push", error)),
      );
      return json({ ok: true, action: "start", status: started.status }, 200, req);
    }

    if (ride.status === "finalizada") {
      return json({ ok: true, reused: true, action: "finish", status: ride.status }, 200, req);
    }
    if (ride.status !== "em_viagem") {
      return json({ error: "invalid_status_transition", status: ride.status }, 409, req);
    }

    const requestedFinalPrice = finitePositive(body.final_price);
    const finalPrice = requestedFinalPrice ?? Number(ride.estimated_price ?? 0);
    if (!Number.isFinite(finalPrice) || finalPrice <= 0) {
      return json({ error: "invalid_final_price" }, 422, req);
    }

    const now = new Date().toISOString();
    const { data: finished, error: finishError } = await admin
      .from("rides")
      .update({ status: "finalizada", completed_at: now, final_price: finalPrice })
      .eq("id", rideId)
      .eq("driver_id", userId)
      .eq("status", "em_viagem")
      .select("*")
      .maybeSingle();

    if (finishError) return json({ error: "ride_finish_failed", detail: finishError.message }, 500, req);
    if (!finished) return json({ error: "status_changed" }, 409, req);

    EdgeRuntime.waitUntil(
      sendPassengerEvent(
        finished,
        "ride.finished",
        "Viagem concluída",
        "Sua corrida foi finalizada.",
      ).catch((error) => console.error("[driver-ride-action] finish push", error)),
    );

    return json(
      {
        ok: true,
        action: "finish",
        status: finished.status,
        final_price: finalPrice,
      },
      200,
      req,
    );
  } catch (error) {
    console.error("[driver-ride-action] fatal", error);
    return json(
      {
        error: "internal_error",
        detail: error instanceof Error ? error.message : String(error),
      },
      500,
      req,
    );
  }
});
