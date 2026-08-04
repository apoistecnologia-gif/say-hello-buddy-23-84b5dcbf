import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { nearestPoiByCoordinates } from "@/lib/geocode.functions";

const inputSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

async function isAuthenticated(request: Request): Promise<boolean> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const result = await supabaseAdmin.auth.getUser(token);
  return Boolean(result.data.user && !result.error);
}

export const Route = createFileRoute("/api/passenger/geocode/nearest-poi")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthenticated(request))) {
          return json({ ok: false, error: "Sessão inválida. Entre novamente." }, 401);
        }

        try {
          const input = inputSchema.parse(await request.json());
          const poi = await nearestPoiByCoordinates(input);
          return json({ ok: true, ...poi });
        } catch (error) {
          console.error("[MOVVI PASSENGER NEAREST POI]", error);
          return json({ ok: false, error: "Não foi possível localizar uma referência próxima." }, 500);
        }
      },
    },
  },
});
