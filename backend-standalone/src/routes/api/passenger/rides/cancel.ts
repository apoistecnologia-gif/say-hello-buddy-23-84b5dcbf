import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const inputSchema = z.object({
  rideId: z.string().uuid(),
  motivo: z.string().trim().max(500).optional(),
});

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

async function sendDriverPush(driverId: string, rideId: string) {
  try {
    const { error } = await supabaseAdmin.functions.invoke("send-ride-push", {
      body: {
        user_ids: [driverId],
        event: "driver.ride_cancelled_by_passenger",
        title: "Corrida cancelada",
        body: "O passageiro cancelou a corrida.",
        ride_id: rideId,
        url: "/motorista/app",
      },
    });
    if (error) console.warn("[MOVVI PUSH] cancelamento:", error.message);
  } catch (error) {
    console.warn("[MOVVI PUSH] envio indisponível:", error);
  }
}

async function authenticatedUser(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";

  if (!token) return null;

  const result = await supabaseAdmin.auth.getUser(token);
  return result.data.user ?? null;
}

export const Route = createFileRoute("/api/passenger/rides/cancel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await authenticatedUser(request);

        if (!user) {
          return json(
            { ok: false, error: "Sessão inválida. Entre novamente." },
            401,
          );
        }

        let input: z.infer<typeof inputSchema>;

        try {
          input = inputSchema.parse(await request.json());
        } catch (error) {
          return json(
            {
              ok: false,
              error: "Dados do cancelamento inválidos.",
              detail: String(error),
            },
            400,
          );
        }

        const current = await supabaseAdmin
          .from("rides")
          .select("*")
          .eq("id", input.rideId)
          .eq("passenger_id", user.id)
          .maybeSingle();

        if (current.error) {
          return json({ ok: false, error: current.error.message }, 500);
        }

        if (!current.data) {
          return json(
            { ok: false, error: "Corrida não encontrada." },
            404,
          );
        }

        const ride = current.data as any;

        if (ride.status === "cancelada_passageiro") {
          return json({ ok: true, data: ride });
        }

        if (
          !["agendada", "procurar_motorista", "motorista_a_caminho", "motorista_chegou"]
            .includes(String(ride.status))
        ) {
          return json(
            {
              ok: false,
              error: "Esta corrida não pode mais ser cancelada.",
            },
            409,
          );
        }

        const cancelled = await supabaseAdmin
          .from("rides")
          .update({
            status: "cancelada_passageiro",
            cancelled_at: new Date().toISOString(),
            cancelled_by: user.id,
            cancel_reason: input.motivo ?? null,
          } as any)
          .eq("id", input.rideId)
          .eq("passenger_id", user.id)
          .in("status", [
            "agendada",
            "procurar_motorista",
            "motorista_a_caminho",
            "motorista_chegou",
          ])
          .select("*")
          .maybeSingle();

        if (cancelled.error) {
          return json({ ok: false, error: cancelled.error.message }, 500);
        }

        if (!cancelled.data) {
          return json(
            {
              ok: false,
              error: "A corrida mudou de estado antes do cancelamento.",
            },
            409,
          );
        }

        if (ride.driver_id) {
          await supabaseAdmin
            .from("notification_inbox")
            .insert({
              user_id: ride.driver_id,
              category: "ride_cancelled",
              title: "Corrida cancelada",
              body: "O passageiro cancelou a corrida.",
              data: {
                ride_id: input.rideId,
                cancelled_by: "passenger",
                reason: input.motivo ?? null,
              },
            })
            .then();
          void sendDriverPush(ride.driver_id, input.rideId);
        }

        return json({ ok: true, data: cancelled.data });
      },
    },
  },
});
