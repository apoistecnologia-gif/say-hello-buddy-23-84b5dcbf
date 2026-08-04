import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { calculateServerFare } from "@/lib/pricing/specialServices";

const inputSchema = z.object({
  origin: z.object({ lat: z.number(), lng: z.number() }),
  destination: z.object({ lat: z.number(), lng: z.number() }),
  stops: z.array(z.object({ lat: z.number(), lng: z.number() })).optional(),
  distanceMeters: z.number(),
  durationSeconds: z.number(),
  categoryIds: z.array(z.string()).optional(),
  serviceDetails: z.record(z.any()).optional(),
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

export const Route = createFileRoute("/api/passenger/pricing/estimate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthenticated(request))) {
          return json({ ok: false, error: "Sessão inválida. Entre novamente." }, 401);
        }

        try {
          const input = inputSchema.parse(await request.json());

          const { data: categories, error: catError } = await supabaseAdmin
            .from("ride_categories")
            .select("id, code, name");

          if (catError) throw catError;

          const { data: rules, error: ruleError } = await supabaseAdmin
            .from("tariff_rules")
            .select("*");

          if (ruleError) throw ruleError;

          const km = input.distanceMeters / 1000;
          const min = input.durationSeconds / 60;

          const estimates = (categories || [])
            .filter((cat) => !input.categoryIds || input.categoryIds.includes(cat.id))
            .map((cat) => {
              const rule = rules?.find(
                (r) => r.category_id === cat.id || r.category_key === cat.code,
              );

              if (!rule) {
                return {
                  categoryId: cat.id,
                  available: false,
                  unavailableReason: "Categoria indisponível no momento",
                };
              }

              // Converter regra do banco para o formato esperado pela função de cálculo
              const tariff: Record<string, number> = {};
              Object.entries(rule).forEach(([key, val]) => {
                if (typeof val === "number") tariff[key] = val;
                else if (typeof val === "string" && !isNaN(Number(val))) tariff[key] = Number(val);
              });

              try {
                const breakdown = calculateServerFare({
                  category: cat.code as any,
                  distanceKm: km,
                  durationMin: min,
                  tariff,
                  serviceDetails: input.serviceDetails,
                });

                return {
                  categoryId: cat.id,
                  categoryCode: cat.code,
                  available: true,
                  estimatedPrice: breakdown.total,
                  basePrice: breakdown.base,
                  extras: breakdown.extras,
                  currency: "BRL",
                  estimatedPickupMinutes: Math.floor(Math.random() * 8) + 2,
                };
              } catch (err: any) {
                return {
                  categoryId: cat.id,
                  available: false,
                  unavailableReason: err.message || "Erro no cálculo",
                };
              }
            });

          return json({ ok: true, estimates, currency: "BRL" });
        } catch (error) {
          console.error("[MOVVI PASSENGER PRICING]", error);
          return json({ ok: false, error: "Erro ao calcular estimativa de preços." }, 500);
        }
      },
    },
  },
});
