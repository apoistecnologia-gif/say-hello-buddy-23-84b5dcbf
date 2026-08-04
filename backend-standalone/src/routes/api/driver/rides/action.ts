import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasCurrentDriverSubscription } from "@/lib/billing/driverEntitlement";
import { calculateServerFare } from "@/lib/pricing/specialServices";

const inputSchema = z.object({
  action: z.enum([
    "status",
    "accept",
    "reject",
    "arrive",
    "start",
    "complete",
    "cancel",
    "rate",
    "confirm_payment",
  ]),
  rideId: z.string().uuid(),
  safety_code: z.string().trim().regex(/^\d{4}$/).optional(),
  motivo: z.string().max(500).optional(),
  stars: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(500).nullable().optional(),
});

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

async function sendRidePush(userIds: string[], event: string, title: string, body: string, rideId: string, url: string) {
  if (!userIds.length) return;
  try {
    const { error } = await supabaseAdmin.functions.invoke("send-ride-push", {
      body: { user_ids: userIds, event, title, body, ride_id: rideId, url },
    });
    if (error) console.warn("[MOVVI PUSH] envio falhou:", error.message);
  } catch (error) {
    console.warn("[MOVVI PUSH] envio indisponível:", error);
  }
}

async function authenticatedUser(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const result = await supabaseAdmin.auth.getUser(token);
  return result.data.user ?? null;
}

async function transition(
  rideId: string,
  userId: string,
  from: string | string[],
  to: string,
  extra: Record<string, unknown> = {},
) {
  let query = supabaseAdmin
    .from("rides")
    .update({ status: to, ...extra } as any)
    .eq("id", rideId)
    .eq("driver_id", userId);
  query = Array.isArray(from) ? query.in("status", from as any) : query.eq("status", from as any);
  const result = await query.select("*").maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("A corrida já mudou de estado ou não pertence a este motorista.");
  return result.data;
}

async function promoteQueuedRide(driverId: string, previousRideId: string) {
  const promoted = await (supabaseAdmin as any)
    .from("rides")
    .update({ queued_after_ride_id: null, queued_at: null } as any)
    .eq("driver_id", driverId)
    .eq("queued_after_ride_id", previousRideId)
    .eq("status", "motorista_a_caminho")
    .select("*")
    .maybeSingle();
  if (promoted.error) throw new Error(promoted.error.message);
  return promoted.data ?? null;
}

async function finalFare(
  category: string,
  distance: unknown,
  duration: unknown,
  serviceDetails: unknown,
) {
  const tariffs = await supabaseAdmin
    .from("tariff_rules")
    .select("field_key,value")
    .eq("category_key", category);
  if (tariffs.error) throw new Error("Falha ao carregar tarifa: " + tariffs.error.message);
  const values: Record<string, number> = {};
  for (const row of tariffs.data ?? []) values[String(row.field_key)] = Number(row.value ?? 0);
  return calculateServerFare({
    category,
    distanceKm: Number(distance ?? 0),
    durationMin: Number(duration ?? 0),
    tariff: values,
    serviceDetails:
      serviceDetails && typeof serviceDetails === "object"
        ? (serviceDetails as Record<string, unknown>)
        : null,
  }).total;
}

export const Route = createFileRoute("/api/driver/rides/action")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await authenticatedUser(request);
        if (!user) return json({ ok: false, error: "Sessão inválida. Entre novamente." }, 401);

        let input: z.infer<typeof inputSchema>;
        try {
          input = inputSchema.parse(await request.json());
        } catch (error) {
          return json({ ok: false, error: "Dados da ação inválidos.", detail: String(error) }, 400);
        }

        const driverFields =
          "id,user_id,email,approval_status,name,phone,vehicle_model,vehicle_plate,vehicle_color,current_lat,current_lng,photo_url";

        let driverResult = await supabaseAdmin
          .from("drivers")
          .select(driverFields)
          .eq("user_id", user.id)
          .maybeSingle();

        // Compatibilidade com cadastros antigos vinculados pelo e-mail.
        if ((!driverResult.data || driverResult.error) && user.email) {
          driverResult = await supabaseAdmin
            .from("drivers")
            .select(driverFields)
            .eq("email", user.email)
            .maybeSingle();
        }

        if (driverResult.error || !driverResult.data) {
          console.error("[MOVVI DRIVER ACTION] cadastro n?o encontrado", {
            authUserId: user.id,
            authEmail: user.email ?? null,
            databaseError: driverResult.error?.message ?? null,
          });

          return json(
            {
              ok: false,
              error: "Cadastro de motorista n?o encontrado.",
            },
            403,
          );
        }

        const driver = driverResult.data as any;

        const driverUserId: string =
          typeof driver.user_id === "string" && driver.user_id
            ? driver.user_id
            : user.id;
        if (driver.approval_status !== "aprovado") {
          return json({ ok: false, error: "Motorista ainda não aprovado." }, 403);
        }
        try {
          if (input.action === "status") {
            const current = await supabaseAdmin
              .from("rides")
              .select("*")
              .eq("id", input.rideId)
              .or(`driver_id.eq.${driverUserId},accepted_driver_id.eq.${driverUserId}`)
              .maybeSingle();

            if (current.error) throw new Error(current.error.message);
            if (!current.data) {
              throw new Error("Corrida não encontrada ou não pertence a este motorista.");
            }

            return json({ ok: true, data: current.data });
          }

          if (input.action === "accept") {
            if (!(await hasCurrentDriverSubscription(driverUserId))) {
              return json(
                {
                  ok: false,
                  error:
                    "Mensalidade vencida. Regularize o plano antes de aceitar novas corridas.",
                },
                403,
              );
            }
            const current = await supabaseAdmin
              .from("rides")
              .select("passenger_id,status,accepted_driver_id,candidate_driver_ids,rejected_driver_ids,request_expires_at")
              .eq("id", input.rideId)
              .maybeSingle();
            if (current.error || !current.data) throw new Error("Corrida não encontrada.");
            const ride = current.data as any;
            const candidates = Array.isArray(ride.candidate_driver_ids) ? ride.candidate_driver_ids : [];
            const rejected = Array.isArray(ride.rejected_driver_ids) ? ride.rejected_driver_ids : [];
            if (ride.status !== "procurar_motorista" || ride.accepted_driver_id) {
              throw new Error("Esta corrida já foi aceita ou cancelada.");
            }
            if (!candidates.includes(driverUserId) || rejected.includes(driverUserId)) {
              throw new Error("Esta corrida não está mais disponível para você.");
            }
            if (!ride.request_expires_at || new Date(ride.request_expires_at).getTime() <= Date.now()) {
              throw new Error("A oferta expirou. Aguarde uma nova chamada.");
            }

            const activeResult = await supabaseAdmin
              .from("rides")
              .select("id,status")
              .eq("driver_id", driverUserId)
              .in("status", ["motorista_a_caminho", "motorista_chegou", "em_viagem"])
              .is("queued_after_ride_id", null)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (activeResult.error) throw new Error(activeResult.error.message);
            const activeRide = activeResult.data as any;
            if (activeRide && activeRide.status !== "em_viagem") {
              throw new Error("Finalize o embarque atual antes de aceitar outra corrida.");
            }
            if (activeRide) {
              const queuedResult = await supabaseAdmin
                .from("rides")
                .select("id")
                .eq("driver_id", driverUserId)
                .not("queued_after_ride_id", "is", null)
                .in("status", ["motorista_a_caminho", "motorista_chegou", "em_viagem"])
                .limit(1)
                .maybeSingle();
              if (queuedResult.error) throw new Error(queuedResult.error.message);
              if (queuedResult.data) throw new Error("Você já possui uma próxima corrida aceita.");
            }
            const queueParentId = activeRide?.id ?? null;

            let passengerPhotoUrl: string | null = null;
            if (ride.passenger_id) {
              const profile = await supabaseAdmin
                .from("users")
                .select("avatar_url")
                .eq("auth_user_id", ride.passenger_id)
                .maybeSingle();
              passengerPhotoUrl = (profile.data as any)?.avatar_url ?? null;
            }
            const vehicle = [driver.vehicle_color, driver.vehicle_model, driver.vehicle_plate]
              .filter((value) => value && String(value).trim())
              .join(" • ") || null;
            const safetyCode = String(Math.floor(1000 + Math.random() * 9000));
            const accepted = await supabaseAdmin
              .from("rides")
              .update({
                driver_id: driverUserId,
                accepted_driver_id: driverUserId,
                status: "motorista_a_caminho",
                accepted_at: new Date().toISOString(),
                current_offer_driver_id: null,
                offered_driver_ids: [],
                driver_name: driver.name ?? null,
                driver_phone: driver.phone ?? null,
                driver_vehicle: vehicle,
                driver_lat: driver.current_lat ?? null,
                driver_lng: driver.current_lng ?? null,
                driver_photo_url: driver.photo_url ?? null,
                passenger_photo_url: passengerPhotoUrl,
                safety_code: safetyCode,
                queued_after_ride_id: queueParentId,
                queued_at: queueParentId ? new Date().toISOString() : null,
              } as any)
              .eq("id", input.rideId)
              .eq("status", "procurar_motorista")
              .is("accepted_driver_id", null)
              .gt("request_expires_at", new Date().toISOString())
              .contains("candidate_driver_ids", [driverUserId])
              .select("*")
              .maybeSingle();
            if (accepted.error) throw new Error(accepted.error.message);
            if (!accepted.data) throw new Error("Outro motorista aceitou esta corrida primeiro.");
            if (ride.passenger_id) void sendRidePush([ride.passenger_id], "passenger.driver_accepted", "Motorista a caminho", `${driver.name ?? "Seu motorista"} aceitou a corrida.`, input.rideId, "/passageiro/app");
            return json({ ok: true, data: accepted.data });
          }

          if (input.action === "reject") {
            const current = await supabaseAdmin
              .from("rides")
              .select("status,accepted_driver_id,candidate_driver_ids,rejected_driver_ids,offered_driver_ids")
              .eq("id", input.rideId)
              .maybeSingle();
            if (current.error || !current.data) throw new Error("Corrida não encontrada.");
            const ride = current.data as any;
            if (ride.status !== "procurar_motorista" || ride.accepted_driver_id) {
              throw new Error("A corrida não está mais aguardando motorista.");
            }
            const candidates = Array.isArray(ride.candidate_driver_ids) ? ride.candidate_driver_ids : [];
            if (!candidates.includes(driverUserId)) throw new Error("Esta corrida não foi ofertada para você.");
            const rejected = Array.from(new Set([...(ride.rejected_driver_ids ?? []), driverUserId]));
            const offered = (Array.isArray(ride.offered_driver_ids) ? ride.offered_driver_ids : [])
              .filter((id: string) => id !== driverUserId);
            const update = await supabaseAdmin
              .from("rides")
              .update({
                rejected_driver_ids: rejected,
                offered_driver_ids: offered,
                current_offer_driver_id: null,
                updated_at: new Date().toISOString(),
              } as any)
              .eq("id", input.rideId)
              .eq("status", "procurar_motorista")
              .is("accepted_driver_id", null)
              .contains("candidate_driver_ids", [driverUserId])
              .select("*")
              .maybeSingle();
            if (update.error) throw new Error(update.error.message);
            if (!update.data) {
              throw new Error("A corrida não está mais disponível para recusa.");
            }
            return json({ ok: true, data: update.data });
          }

          if (input.action === "arrive") {
            const current = await supabaseAdmin
              .from("rides")
              .select("queued_after_ride_id")
              .eq("id", input.rideId)
              .eq("driver_id", driverUserId)
              .maybeSingle();
            if (current.error || !current.data) throw new Error("Corrida não encontrada.");
            if ((current.data as any).queued_after_ride_id) {
              throw new Error("Finalize a corrida atual antes de ir ao próximo passageiro.");
            }
            const arrived = await transition(input.rideId, driverUserId, "motorista_a_caminho", "motorista_chegou");
            if ((arrived as any).passenger_id) void sendRidePush([(arrived as any).passenger_id], "passenger.driver_arrived", "Seu motorista chegou", "Tenha o código de segurança em mãos.", input.rideId, "/passageiro/app");
            return json({ ok: true, data: arrived });
          }

          if (input.action === "start") {
            const current = await supabaseAdmin
              .from("rides")
              .select("safety_code,status,driver_id")
              .eq("id", input.rideId)
              .maybeSingle();
            if (current.error || !current.data) throw new Error("Corrida não encontrada.");
            const ride = current.data as any;
            if (ride.driver_id !== driverUserId || ride.status !== "motorista_chegou") {
              throw new Error("A corrida não está pronta para iniciar.");
            }
            if (!input.safety_code || String(ride.safety_code) !== input.safety_code) {
              throw new Error("Código incorreto. Peça o código ao passageiro.");
            }
            const started = await transition(input.rideId, driverUserId, "motorista_chegou", "em_viagem", { started_at: new Date().toISOString() });
            if ((started as any).passenger_id) void sendRidePush([(started as any).passenger_id], "passenger.ride_started", "Viagem iniciada", "Acompanhe o trajeto pelo aplicativo.", input.rideId, "/passageiro/app");
            return json({ ok: true, data: started });
          }

          if (input.action === "complete") {
            const current = await supabaseAdmin
              .from("rides")
              .select("category,distance_km,duration_min,driver_id,status,service_details")
              .eq("id", input.rideId)
              .maybeSingle();
            if (current.error || !current.data) throw new Error("Corrida não encontrada.");
            const ride = current.data as any;
            if (ride.driver_id !== driverUserId || ride.status !== "em_viagem") throw new Error("A corrida não pode ser finalizada agora.");
            const price = await finalFare(
              String(ride.category),
              ride.distance_km,
              ride.duration_min,
              ride.service_details,
            );
            const completed = await transition(input.rideId, driverUserId, "em_viagem", "finalizada", { completed_at: new Date().toISOString(), final_price: price });
            if ((completed as any).passenger_id) void sendRidePush([(completed as any).passenger_id], "passenger.ride_finished", "Corrida finalizada", "Confira o valor e avalie seu motorista.", input.rideId, "/passageiro/app");
            const nextRide = await promoteQueuedRide(driverUserId, input.rideId);
            return json({ ok: true, data: { ...(completed as any), next_ride: nextRide } });
          }

          if (input.action === "cancel") {
            const current = await supabaseAdmin
              .from("rides")
              .select("status,driver_id,candidate_driver_ids,rejected_driver_ids")
              .eq("id", input.rideId)
              .maybeSingle();
            if (current.error || !current.data) throw new Error("Corrida não encontrada.");
            const ride = current.data as any;
            if (ride.driver_id !== driverUserId || !["motorista_a_caminho", "motorista_chegou"].includes(ride.status)) {
              throw new Error("A corrida não pode ser cancelada agora.");
            }
            const candidates: string[] = Array.isArray(ride.candidate_driver_ids) ? ride.candidate_driver_ids : [];
            const rejected = Array.from(new Set([...(Array.isArray(ride.rejected_driver_ids) ? ride.rejected_driver_ids : []), driverUserId]));
            const remaining = candidates.filter((id) => id !== driverUserId && !rejected.includes(id));
            const searching = await supabaseAdmin
              .from("rides")
              .update({
                status: "procurar_motorista",
                driver_id: null,
                accepted_driver_id: null,
                accepted_at: null,
                started_at: null,
                current_offer_driver_id: null,
                offered_driver_ids: remaining,
                rejected_driver_ids: rejected,
                request_expires_at: new Date(Date.now() + 60_000).toISOString(),
                driver_name: null,
                driver_phone: null,
                driver_vehicle: null,
                driver_lat: null,
                driver_lng: null,
                driver_photo_url: null,
                passenger_photo_url: null,
                safety_code: null,
                cancelled_at: null,
                cancelled_by: null,
                cancel_reason: null,
              } as any)
              .eq("id", input.rideId)
              .eq("driver_id", driverUserId)
              .in("status", ["motorista_a_caminho", "motorista_chegou"])
              .select("*")
              .maybeSingle();
            if (searching.error) throw new Error(searching.error.message);
            if (!searching.data) throw new Error("A corrida mudou de estado antes do cancelamento.");
            if ((searching.data as any).passenger_id) void sendRidePush([(searching.data as any).passenger_id], "passenger.ride_cancelled", "Motorista cancelou", "Estamos procurando outro motorista para você.", input.rideId, "/passageiro/app");
            if (remaining.length) void sendRidePush(remaining, "driver.new_ride_request", "MOVVI • Nova corrida disponível", `${(searching.data as any).origin_name ?? "Origem"} → ${(searching.data as any).destination_name ?? "Destino"}`, input.rideId, "/motorista/app");
            console.info("[MOVVI REDESPACHO] motorista cancelou; procurando substituto", {
              rideId: input.rideId,
              rejectedDriverId: driverUserId,
              remainingCandidates: remaining.length,
            });
            return json({ ok: true, data: searching.data });
          }

          if (input.action === "confirm_payment") {
            const now = new Date().toISOString();
            const confirmed = await supabaseAdmin
              .from("rides")
              .update({
                payment_received_at: now,
                payment_received_by: driverUserId,
              } as any)
              .eq("id", input.rideId)
              .eq("driver_id", driverUserId)
              .eq("status", "finalizada")
              .is("payment_received_at", null)
              .select("id,payment_received_at,payment_received_by")
              .maybeSingle();
            if (confirmed.error) throw new Error(confirmed.error.message);
            if (confirmed.data) {
              return json({ ok: true, data: confirmed.data });
            }
            const existing = await supabaseAdmin
              .from("rides")
              .select("id,payment_received_at,payment_received_by")
              .eq("id", input.rideId)
              .eq("driver_id", driverUserId)
              .eq("status", "finalizada")
              .maybeSingle();
            if (existing.error || !existing.data) {
              throw new Error(
                "A confirmação só pode ser feita pelo motorista após a corrida.",
              );
            }
            return json({ ok: true, data: existing.data });
          }

          if (!input.stars) throw new Error("Escolha uma nota de 1 a 5.");
          const rating = await supabaseAdmin
            .from("rides")
            .update({ passenger_rating: input.stars, passenger_rating_comment: input.comment ?? null, driver_rated_at: new Date().toISOString() } as any)
            .eq("id", input.rideId)
            .eq("driver_id", driverUserId)
            .eq("status", "finalizada")
            .is("driver_rated_at", null)
            .select("id")
            .maybeSingle();
          if (rating.error) throw new Error(rating.error.message);
          return json({ ok: true, data: { ok: true } });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Falha na ação da corrida.";
          console.error("[driver-ride-action]", {
            action: input.action,
            rideId: input.rideId,
            driverUserId,
            message,
            error,
          });
          return json(
            {
              ok: false,
              error: message,
              code: "DRIVER_RIDE_ACTION_FAILED",
            },
            409,
          );
        }
      },
    },
  },
});
