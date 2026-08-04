import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

const LatLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const InputSchema = z.object({
  origin: LatLngSchema,
  destination: LatLngSchema,
});

export type RouteStep = {
  lat: number;
  lng: number;
  distanceMeters: number;
  instruction: string;
  maneuver?: string;
};

export type RouteResult = {
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string;
  steps: RouteStep[];
};


// Requer usuário autenticado para evitar consumo abusivo da chave do Google Maps.
export const computeRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<RouteResult> => {
    const mapsKey =
      process.env.GOOGLE_MAPS_PLATFORM_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY;
    if (!mapsKey) {
      throw new Error("Google Maps não configurado no servidor.");
    }

    const body = {
      origin: { location: { latLng: { latitude: data.origin.lat, longitude: data.origin.lng } } },
      destination: { location: { latLng: { latitude: data.destination.lat, longitude: data.destination.lng } } },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      polylineEncoding: "ENCODED_POLYLINE",
      languageCode: "pt-BR",
      regionCode: "BR",
    };

    const res = await fetch(GOOGLE_ROUTES_URL, {
      method: "POST",
      headers: {
        "X-Goog-Api-Key": mapsKey,
        "Content-Type": "application/json",
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.steps.navigationInstruction,routes.legs.steps.startLocation,routes.legs.steps.distanceMeters",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      // Log the upstream error server-side only; never leak details to clients.
      console.error("[MOVVI ROUTE] upstream Routes API error", res.status, text.slice(0, 500));
      throw new Error("Não foi possível calcular a rota.");
    }

    const json = (await res.json()) as {
      routes?: Array<{
        distanceMeters?: number;
        duration?: string;
        polyline?: { encodedPolyline?: string };
        legs?: Array<{
          steps?: Array<{
            distanceMeters?: number;
            navigationInstruction?: { instructions?: string; maneuver?: string };
            startLocation?: { latLng?: { latitude?: number; longitude?: number } };
          }>;
        }>;
      }>;
    };
    const route = json.routes?.[0];
    if (!route?.polyline?.encodedPolyline) {
      throw new Error("Nenhuma rota encontrada para esse trajeto.");
    }
    const durationSeconds = route.duration ? parseInt(route.duration.replace("s", ""), 10) : 0;

    const steps: RouteStep[] = [];
    for (const leg of route.legs ?? []) {
      for (const st of leg.steps ?? []) {
        const lat = st.startLocation?.latLng?.latitude;
        const lng = st.startLocation?.latLng?.longitude;
        const instr = st.navigationInstruction?.instructions;
        if (typeof lat === "number" && typeof lng === "number" && instr) {
          steps.push({
            lat, lng,
            distanceMeters: st.distanceMeters ?? 0,
            instruction: instr,
            maneuver: st.navigationInstruction?.maneuver,
          });
        }
      }
    }

    return {
      distanceMeters: route.distanceMeters ?? 0,
      durationSeconds,
      encodedPolyline: route.polyline.encodedPolyline,
      steps,
    };
  });
