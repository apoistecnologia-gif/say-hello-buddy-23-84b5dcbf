import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

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

function bearer(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

function clientForUser(token: string) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) throw new Error("Supabase server configuration missing.");
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export const Route = createFileRoute("/api/passenger/rides/rating")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = bearer(request);
        if (!token) {
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

        // "Pular" apenas fecha a etapa na interface. Não grava uma avaliação
        // falsa nem marca a corrida como avaliada; o passageiro ainda pode
        // avaliar depois pelo histórico.
        if (input.action === "skip") {
          return json({ ok: true, data: { rideId: input.rideId, skipped: true } });
        }

        try {
          const client = clientForUser(token);
          const { data, error } = await client.rpc("rate_passenger_ride", {
            _ride_id: input.rideId,
            _rating: input.stars!,
            _comment: input.comment ?? null,
          });

          if (error) {
            const message = error.message || "Não foi possível salvar a avaliação.";
            const status = /unauthorized/i.test(message)
              ? 401
              : /not_found|missing/i.test(message)
              ? 404
              : /not_completed|already_rated|out_of_range|invalid/i.test(message)
              ? 409
              : 500;
            return json({ ok: false, error: message }, status);
          }

          return json({ ok: true, data });
        } catch (error) {
          console.error("[passenger-rides-rating]", error);
          return json({ ok: false, error: "Não foi possível salvar a avaliação." }, 500);
        }
      },
    },
  },
});
