import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

export const Route = createFileRoute("/api/driver/routes/compute")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
          if (!token) return json({ ok: false, error: "Sessão inválida. Entre novamente." }, 401);

          const supabaseUrl = process.env.SUPABASE_URL;
          const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
          if (!supabaseUrl || !publishableKey) return json({ ok: false, error: "Servidor não configurado." }, 500);
          const auth = createClient(supabaseUrl, publishableKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: userData, error: authError } = await auth.auth.getUser(token);
          if (authError || !userData.user) return json({ ok: false, error: "Sessão inválida. Entre novamente." }, 401);

          const input = await request.json() as any;
          const origin = input?.origin;
          const destination = input?.destination;
          const valid = (p: any) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng)
            && p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180;
          if (!valid(origin) || !valid(destination)) return json({ ok: false, error: "Origem ou destino inválido." }, 400);


          const mapsKey =
            process.env.GOOGLE_ROUTES_API_KEY ??
            process.env.GOOGLE_MAPS_PLATFORM_API_KEY ??
            process.env.GOOGLE_MAPS_API_KEY;
          if (!mapsKey) return json({ ok: false, error: "Google Maps não configurado no servidor." }, 503);

          const upstream = await fetch(GOOGLE_ROUTES_URL, {
            method: "POST",
            headers: {
              "X-Goog-Api-Key": mapsKey,

              "Content-Type": "application/json",
              "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.steps.navigationInstruction,routes.legs.steps.startLocation,routes.legs.steps.distanceMeters",
            },
            body: JSON.stringify({
              origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
              destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
              travelMode: "DRIVE",
              routingPreference: "TRAFFIC_AWARE",
              polylineEncoding: "ENCODED_POLYLINE",
              languageCode: "pt-BR",
              regionCode: "BR",
            }),
          });
          if (!upstream.ok) {
            const upstreamText = (await upstream.text()).slice(0, 1200);
            const keyBlocked =
              upstream.status === 403 &&
              (upstreamText.includes("API_KEY_SERVICE_BLOCKED") ||
                upstreamText.includes("PERMISSION_DENIED"));
            console.error("[MOVVI ROUTE API] Google error", {
              status: upstream.status,
              keyBlocked,
              body: upstreamText,
            });
            return json(
              {
                ok: false,
                error: keyBlocked
                  ? "A chave do servidor não tem permissão para usar a Routes API."
                  : "Não foi possível calcular a rota.",
                code: keyBlocked
                  ? "GOOGLE_ROUTES_KEY_BLOCKED"
                  : "GOOGLE_ROUTES_UPSTREAM_ERROR",
              },
              502,
            );
          }
          const body = await upstream.json() as any;
          const route = body.routes?.[0];
          if (!route?.polyline?.encodedPolyline) return json({ ok: false, error: "Nenhuma rota encontrada." }, 404);
          const steps = (route.legs ?? []).flatMap((leg: any) => (leg.steps ?? []).flatMap((step: any) => {
            const lat = step.startLocation?.latLng?.latitude;
            const lng = step.startLocation?.latLng?.longitude;
            const instruction = step.navigationInstruction?.instructions;
            return Number.isFinite(lat) && Number.isFinite(lng) && instruction ? [{
              lat, lng, instruction,
              distanceMeters: step.distanceMeters ?? 0,
              maneuver: step.navigationInstruction?.maneuver,
            }] : [];
          }));
          return json({ ok: true, route: {
            distanceMeters: route.distanceMeters ?? 0,
            durationSeconds: Number.parseInt(String(route.duration ?? "0s").replace("s", ""), 10) || 0,
            encodedPolyline: route.polyline.encodedPolyline,
            steps,
          }});
        } catch (error) {
          console.error("[MOVVI ROUTE API]", error);
          return json({ ok: false, error: "Erro interno ao calcular a rota." }, 500);
        }
      },
    },
  },
});
