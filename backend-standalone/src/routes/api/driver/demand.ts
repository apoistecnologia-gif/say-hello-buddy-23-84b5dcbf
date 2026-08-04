import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, max-age=45" },
  });
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

const GRID_DEGREES = 0.02;

export const Route = createFileRoute("/api/driver/demand")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await authenticatedUser(request);
        if (!user) return json({ ok: false, error: "Sessão inválida." }, 401);

        const driverResult = await supabaseAdmin
          .from("drivers")
          .select("approval_status,subscription_status")
          .eq("user_id", user.id)
          .maybeSingle();
        const driver = driverResult.data as {
          approval_status?: string | null;
          subscription_status?: string | null;
        } | null;
        if (
          driverResult.error ||
          !driver ||
          driver.approval_status !== "aprovado" ||
          (driver.subscription_status && driver.subscription_status !== "active")
        ) {
          return json({ ok: false, error: "Motorista não autorizado." }, 403);
        }

        const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const rides = await supabaseAdmin
          .from("rides")
          .select("origin_lat,origin_lng")
          .gte("created_at", since)
          .in("status", [
            "procurar_motorista",
            "motorista_a_caminho",
            "motorista_chegou",
            "em_viagem",
            "finalizada",
          ])
          .limit(500);
        if (rides.error) {
          console.error("[MOVVI DEMANDA] consulta falhou", rides.error.message);
          return json({ ok: false, error: "Demanda indisponível." }, 503);
        }

        const cells = new Map<string, { lat: number; lng: number; count: number }>();
        for (const row of rides.data ?? []) {
          const lat = Number(row.origin_lat);
          const lng = Number(row.origin_lng);
          if (
            !Number.isFinite(lat) ||
            !Number.isFinite(lng) ||
            lat < -34 || lat > 6 || lng < -74 || lng > -34
          ) continue;
          const cellLat = Math.round(lat / GRID_DEGREES) * GRID_DEGREES;
          const cellLng = Math.round(lng / GRID_DEGREES) * GRID_DEGREES;
          const key = `${cellLat.toFixed(2)}:${cellLng.toFixed(2)}`;
          const current = cells.get(key);
          if (current) current.count += 1;
          else cells.set(key, { lat: cellLat, lng: cellLng, count: 1 });
        }

        // Pelo menos duas solicitações por célula: evita expor a área de uma
        // corrida isolada. Nenhum dado pessoal ou endereço sai deste endpoint.
        const points = [...cells.values()]
          .filter((cell) => cell.count >= 2)
          .sort((a, b) => b.count - a.count)
          .slice(0, 12)
          .map((cell) => ({ ...cell, count: Math.min(cell.count, 9) }));

        return json({ ok: true, points });
      },
    },
  },
});
