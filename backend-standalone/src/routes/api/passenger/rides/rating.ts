import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const inputSchema = z
  .object({
    rideId: z.string().uuid(),
    action: z.enum(["rate", "skip"]),
    stars: z.number().int().min(1).max(5).optional(),
    comment: z.string().trim().max(500).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.action === "rate" && value.stars == null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stars"],
        message: "Escolha uma nota de 1 a 5.",
      });
    }
  });

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

async function authenticatedUser(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const result = await supabaseAdmin.auth.getUser(token);
  return result.data.user ?? null;
}

export const Route = createFileRoute("/api/passenger/rides/rating")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await authenticatedUser(request);
        if (!user) {
          return json({ ok: false, error: "Sessão inválida. Entre novamente." }, 401);
        }

        let input: z.infer<typeof inputSchema>;
        try {
          input = inputSchema.parse(await request.json());
        } catch (error) {
          return json(
            { ok: false, error: "Dados da avaliação inválidos.", detail: String(error) },
            400,
          );
        }

        const current = await supabaseAdmin
          .from("rides")
          .select("id,status,passenger_rated_at,driver_rating")
          .eq("id", input.rideId)
          .eq("passenger_id", user.id)
          .maybeSingle();

        if (current.error) return json({ ok: false, error: current.error.message }, 500);
        if (!current.data) return json({ ok: false, error: "Corrida não encontrada." }, 404);
        if (String(current.data.status) !== "finalizada") {
          return json({ ok: false, error: "A corrida ainda não foi finalizada." }, 409);
        }

        // Repetir a chamada e seguro: se ja avaliou ou pulou, apenas confirma.
        if ((current.data as any).passenger_rated_at) {
          return json({ ok: true, data: { id: current.data.id, alreadyCompleted: true } });
        }

        const now = new Date().toISOString();
        const update =
          input.action === "rate"
            ? {
                driver_rating: input.stars,
                driver_rating_comment: input.comment || null,
                passenger_rated_at: now,
              }
            : {
                driver_rating: null,
                driver_rating_comment: null,
                passenger_rated_at: now,
              };

        const saved = await supabaseAdmin
          .from("rides")
          .update(update as any)
          .eq("id", input.rideId)
          .eq("passenger_id", user.id)
          .eq("status", "finalizada")
          .is("passenger_rated_at", null)
          .select("id,passenger_rated_at,driver_rating")
          .maybeSingle();

        if (saved.error) return json({ ok: false, error: saved.error.message }, 500);
        if (!saved.data) {
          return json({ ok: false, error: "A avaliação já foi concluída em outro aparelho." }, 409);
        }

        return json({ ok: true, data: saved.data });
      },
    },
  },
});
