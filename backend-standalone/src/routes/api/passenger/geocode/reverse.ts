import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { reverseGeocodeByCoordinates } from "@/lib/geocode.functions";

const inputSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

async function isAuthenticated(request: Request): Promise<boolean> {
  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) return false;
  const result = await supabaseAdmin.auth.getUser(token);
  return Boolean(result.data.user && !result.error);
}

export const Route = createFileRoute("/api/passenger/geocode/reverse")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthenticated(request))) {
          return json({ ok: false, error: "Sessão inválida. Entre novamente." }, 401);
        }

        try {
          const input = inputSchema.parse(await request.json());
          const geo = await reverseGeocodeByCoordinates(input);
          return json({ ok: true, geo });
        } catch (error) {
          console.error("[MOVVI PASSENGER GEOCODE]", error);
          return json({ ok: false, error: "Não foi possível identificar o endereço." }, 500);
        }
      },
    },
  },
});
