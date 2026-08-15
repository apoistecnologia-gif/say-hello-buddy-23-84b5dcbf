import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const inputSchema = z.object({
  rideId: z.string().uuid(),
  motivo: z.string().trim().max(500).optional(),
});

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function bearer(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

export const Route = createFileRoute("/api/passenger/rides/cancel")({
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
            {
              ok: false,
              error: "Dados do cancelamento inválidos.",
              detail: String(error),
            },
            400,
          );
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!supabaseUrl || !anonKey) {
          return json({ ok: false, error: "Configuração do servidor indisponível." }, 500);
        }

        // Compatibility route only. Cancellation policy, fee creation, wallet
        // blocking, Pix charge cancellation and reconciliation all belong to
        // the canonical cancel-ride Edge Function + transactional RPC.
        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/cancel-ride`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              apikey: anonKey,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              ride_id: input.rideId,
              ...(input.motivo ? { reason: input.motivo } : {}),
            }),
          });

          const raw = await response.text();
          const payload = raw ? JSON.parse(raw) : {};
          return json(payload, response.status);
        } catch (error) {
          console.error("[passenger-rides-cancel] canonical cancellation failed", error);
          return json({ ok: false, error: "Não foi possível cancelar a corrida agora." }, 502);
        }
      },
    },
  },
});
