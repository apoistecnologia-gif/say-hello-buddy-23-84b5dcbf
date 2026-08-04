import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { currentDriverSubscriptionIds } from "@/lib/billing/driverEntitlement";

const RADII_KM = [3, 5, 8, 12, 20, 30, 50];
const MAX_GPS_AGE_SECONDS = 120;
const REQUEST_TIMEOUT_SECONDS = 60;

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeCategory(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const radius = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const value =
    s1 * s1 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * s2 * s2;
  return 2 * radius * Math.asin(Math.sqrt(value));
}

async function sendRidePush(
  userIds: string[],
  event: string,
  title: string,
  body: string,
  rideId: string,
  url: string,
) {
  if (!userIds.length) return;
  try {
    const { error } = await supabaseAdmin.functions.invoke("send-ride-push", {
      body: {
        user_ids: userIds,
        event,
        title,
        body,
        ride_id: rideId,
        url,
      },
    });
    if (error) console.warn("[scheduled-rides] push failed", error.message);
  } catch (error) {
    console.warn("[scheduled-rides] push unavailable", error);
  }
}

async function dispatchScheduledRide(ride: any): Promise<string[]> {
  const { data: drivers, error: driverError } = await supabaseAdmin
    .from("drivers")
    .select("user_id,category,is_online,approval_status,current_lat,current_lng,last_location_at");
  if (driverError) throw new Error(driverError.message);

  const driverIds = (drivers ?? [])
    .map((driver: any) => String(driver.user_id ?? ""))
    .filter(Boolean);
  const entitledDrivers = await currentDriverSubscriptionIds(driverIds);

  const preferencesResult = driverIds.length
    ? await supabaseAdmin
        .from("driver_preferences")
        .select(
          "user_id,ride_alerts,accept_short,accept_long,max_radius_km,accept_cash,accept_pix,accept_card",
        )
        .in("user_id", driverIds)
    : { data: [], error: null };

  if (preferencesResult.error) {
    throw new Error(preferencesResult.error.message);
  }

  const preferencesByDriver = new Map(
    (preferencesResult.data ?? []).map((preference: any) => [
      String(preference.user_id),
      preference,
    ]),
  );

  const { data: assignedRides, error: assignedError } = await supabaseAdmin
    .from("rides")
    .select("id,driver_id,status,destination_lat,destination_lng,queued_after_ride_id")
    .in("status", ["motorista_a_caminho", "motorista_chegou", "em_viagem"])
    .not("driver_id", "is", null);

  if (assignedError) throw new Error(assignedError.message);

  const activeByDriver = new Map<string, any>();
  const queuedDrivers = new Set<string>();

  for (const assigned of assignedRides ?? []) {
    const driverId = String((assigned as any).driver_id ?? "");
    if (!driverId) continue;
    if ((assigned as any).queued_after_ride_id) queuedDrivers.add(driverId);
    else activeByDriver.set(driverId, assigned);
  }

  const rejected = new Set<string>(
    Array.isArray(ride.rejected_driver_ids) ? ride.rejected_driver_ids.map(String) : [],
  );

  const now = Date.now();
  const origin = {
    lat: Number(ride.origin_lat),
    lng: Number(ride.origin_lng),
  };
  const category = normalizeCategory(ride.category);
  const isShortRide = Number(ride.distance_km ?? 0) <= 10;
  const paymentMethod = String(ride.payment_method ?? "").toLowerCase();

  const eligible = (drivers ?? [])
    .filter((driver: any) => {
      const driverId = String(driver.user_id ?? "");
      if (!driverId || rejected.has(driverId)) return false;
      if (!entitledDrivers.has(driverId)) return false;
      if (!driver.is_online || driver.approval_status !== "aprovado") return false;
      if (normalizeCategory(driver.category) !== category) return false;
      if (!finiteNumber(driver.current_lat) || !finiteNumber(driver.current_lng)) {
        return false;
      }

      if (driver.last_location_at) {
        const ageSeconds = (now - new Date(driver.last_location_at).getTime()) / 1000;
        if (ageSeconds > MAX_GPS_AGE_SECONDS) return false;
      }

      const active = activeByDriver.get(driverId);
      if (queuedDrivers.has(driverId)) return false;
      if (active && active.status !== "em_viagem") return false;

      const preference: any = preferencesByDriver.get(driverId);
      if (preference?.ride_alerts === false) return false;
      if (isShortRide && preference?.accept_short === false) return false;
      if (!isShortRide && preference?.accept_long === false) return false;

      if (["cash", "dinheiro"].includes(paymentMethod) && preference?.accept_cash === false) {
        return false;
      }
      if (paymentMethod === "pix" && preference?.accept_pix === false) {
        return false;
      }
      if (
        [
          "card",
          "credit",
          "credit_card",
          "cartao_credito",
          "debit",
          "debit_card",
          "maquininha",
        ].includes(paymentMethod) &&
        preference?.accept_card === false
      ) {
        return false;
      }

      return true;
    })
    .map((driver: any) => {
      const driverId = String(driver.user_id);
      const active = activeByDriver.get(driverId);
      const reference =
        active && finiteNumber(active.destination_lat) && finiteNumber(active.destination_lng)
          ? {
              lat: Number(active.destination_lat),
              lng: Number(active.destination_lng),
            }
          : {
              lat: Number(driver.current_lat),
              lng: Number(driver.current_lng),
            };

      return {
        userId: driverId,
        km: distanceKm(origin, reference),
        maxRadiusKm: Math.max(
          1,
          Math.min(50, Number((preferencesByDriver.get(driverId) as any)?.max_radius_km ?? 10)),
        ),
      };
    });

  let chosen: Array<{ userId: string; km: number; maxRadiusKm: number }> = [];

  for (const radius of RADII_KM) {
    const within = eligible
      .filter((driver) => driver.km <= radius && driver.km <= driver.maxRadiusKm)
      .sort((a, b) => a.km - b.km);

    if (within.length) {
      chosen = within;
      break;
    }
  }

  if (!chosen.length) return [];

  const ids = chosen.map((driver) => driver.userId);
  const updated = await supabaseAdmin
    .from("rides")
    .update({
      candidate_driver_ids: ids,
      offered_driver_ids: ids,
      current_offer_driver_id: null,
      request_expires_at: new Date(Date.now() + REQUEST_TIMEOUT_SECONDS * 1000).toISOString(),
      dispatch_attempts: Number(ride.dispatch_attempts ?? 0) + 1,
    } as any)
    .eq("id", ride.id)
    .eq("status", "procurar_motorista")
    .is("accepted_driver_id", null)
    .select("id")
    .maybeSingle();

  if (updated.error) throw new Error(updated.error.message);
  if (!updated.data) return [];
  return ids;
}

export const Route = createFileRoute("/api/public/hooks/activate-scheduled-rides")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET?.trim() ?? "";
        if (!cronSecret) {
          return json({ error: "cron_secret_not_configured" }, 503);
        }

        const authorization = request.headers.get("authorization") ?? "";
        const provided = authorization.toLowerCase().startsWith("bearer ")
          ? authorization.slice(7).trim()
          : "";

        if (!provided || provided !== cronSecret) {
          return json({ error: "unauthorized" }, 401);
        }

        const activation = await supabaseAdmin.rpc("activate_due_scheduled_rides");

        if (activation.error) {
          console.error("[scheduled-rides] activation failed", activation.error);
          return json(
            {
              error: "rpc_failed",
              detail: activation.error.message,
            },
            500,
          );
        }

        const activatedIds = ((activation.data as { activated_ride_id: string }[] | null) ?? [])
          .map((row) => row.activated_ride_id)
          .filter(Boolean);

        let activatedRides: any[] = [];
        if (activatedIds.length) {
          const result = await supabaseAdmin.from("rides").select("*").in("id", activatedIds);

          if (result.error) {
            return json(
              {
                error: "activated_rides_load_failed",
                detail: result.error.message,
              },
              500,
            );
          }
          activatedRides = result.data ?? [];
        }

        const nowIso = new Date().toISOString();
        const scheduledExpiryCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const expiredResult = await supabaseAdmin
          .from("rides")
          .update({
            status: "cancelada_passageiro",
            cancelled_at: nowIso,
            cancelled_by: null,
            cancel_reason: "Nenhum motorista disponível para o horário agendado.",
            candidate_driver_ids: [],
            offered_driver_ids: [],
            current_offer_driver_id: null,
          } as any)
          .eq("status", "procurar_motorista")
          .not("scheduled_for", "is", null)
          .is("accepted_driver_id", null)
          .lte("scheduled_for", scheduledExpiryCutoff)
          .select("id,passenger_id");

        if (expiredResult.error) {
          return json(
            {
              error: "scheduled_expiry_failed",
              detail: expiredResult.error.message,
            },
            500,
          );
        }

        for (const expired of expiredResult.data ?? []) {
          if (!expired.passenger_id) continue;
          await supabaseAdmin.from("notification_inbox").insert({
            user_id: expired.passenger_id,
            title: "Não encontramos motorista",
            body: "Sua corrida agendada foi encerrada sem cobrança. Tente solicitar uma nova corrida.",
            category: "ride",
            data: { ride_id: expired.id, kind: "scheduled_search_expired" },
          });
          void sendRidePush(
            [String(expired.passenger_id)],
            "passenger.ride_cancelled",
            "Não encontramos motorista",
            "A busca da sua corrida agendada terminou sem cobrança.",
            String(expired.id),
            "/passageiro/corridas",
          );
        }

        const retryResult = await supabaseAdmin
          .from("rides")
          .select("*")
          .eq("status", "procurar_motorista")
          .not("scheduled_for", "is", null)
          .is("accepted_driver_id", null)
          .lte("scheduled_for", new Date(Date.now() + 15 * 60 * 1000).toISOString())
          .gt("scheduled_for", scheduledExpiryCutoff)
          .or(`request_expires_at.is.null,request_expires_at.lt.${nowIso}`)
          .limit(100);

        if (retryResult.error) {
          return json({ error: "retry_load_failed", detail: retryResult.error.message }, 500);
        }

        const ridesById = new Map<string, any>();
        for (const ride of activatedRides) ridesById.set(String(ride.id), ride);
        for (const ride of retryResult.data ?? []) {
          ridesById.set(String((ride as any).id), ride);
        }

        for (const ride of activatedRides) {
          if (ride.passenger_id) {
            await supabaseAdmin.from("notification_inbox").insert({
              user_id: ride.passenger_id,
              title: "Sua corrida agendada começou a buscar motorista",
              body: ride.destination_name
                ? `Estamos procurando um motorista para levar você até ${ride.destination_name}.`
                : "Estamos procurando um motorista para sua corrida agendada.",
              category: "ride",
              data: {
                ride_id: ride.id,
                kind: "scheduled_activated",
              },
            });

            void sendRidePush(
              [String(ride.passenger_id)],
              "passenger.scheduled_search_started",
              "Buscando motorista",
              "Sua corrida agendada começou a procurar um motorista.",
              String(ride.id),
              "/passageiro/app",
            );
          }
        }

        let notifiedDrivers = 0;
        let dispatchedRides = 0;

        for (const ride of ridesById.values()) {
          try {
            const candidateIds = await dispatchScheduledRide(ride);
            if (!candidateIds.length) continue;

            dispatchedRides += 1;
            notifiedDrivers += candidateIds.length;

            void sendRidePush(
              candidateIds,
              "driver.new_ride_request",
              "MOVVI • Nova corrida agendada",
              `${ride.origin_name ?? "Origem"} → ${ride.destination_name ?? "Destino"}`,
              String(ride.id),
              "/motorista/app",
            );
          } catch (error) {
            console.error("[scheduled-rides] dispatch failed", ride.id, error);
          }
        }

        return json({
          ok: true,
          activated: activatedIds.length,
          checked: ridesById.size,
          dispatched: dispatchedRides,
          notified_drivers: notifiedDrivers,
          expired: expiredResult.data?.length ?? 0,
          ids: activatedIds,
        });
      },
    },
  },
});
