import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { getCorsHeaders } from '../_shared/cors.ts'
import { isValidLatLng } from '../_shared/google-maps.ts'

const GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: getCorsHeaders(req) });

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: getCorsHeaders(req) });

    const { origin, destination, stops = [] } = await req.json();
    
    if (!isValidLatLng(origin) || !isValidLatLng(destination)) {
      return new Response(JSON.stringify({ error: 'Invalid origin or destination' }), { status: 400, headers: getCorsHeaders(req) });
    }
    if (stops.length > 3) {
      return new Response(JSON.stringify({ error: 'Maximum 3 stops allowed' }), { status: 400, headers: getCorsHeaders(req) });
    }

    const mapsKey = Deno.env.get("GOOGLE_ROUTES_API_KEY") || Deno.env.get("GOOGLE_MAPS_PLATFORM_API_KEY") || Deno.env.get("GOOGLE_MAPS_API_KEY");
    
    const intermediates = stops.map((s: any) => ({
      location: { latLng: { latitude: s.lat, longitude: s.lng } }
    }));

    const body = {
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
      intermediates,
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      polylineEncoding: "ENCODED_POLYLINE",
      languageCode: "pt-BR",
      regionCode: "BR",
    };

    const res = await fetch(GOOGLE_ROUTES_URL, {
      method: "POST",
      headers: {
        "X-Goog-Api-Key": mapsKey!,
        "Content-Type": "application/json",
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return new Response(JSON.stringify({ error: 'Route calculation failed', details: errorText }), { status: res.status, headers: getCorsHeaders(req) });
    }

    const json = await res.json();
    const route = json.routes?.[0];
    if (!route) return new Response(JSON.stringify({ error: 'No route found' }), { status: 404, headers: getCorsHeaders(req) });

    return new Response(JSON.stringify({
      distanceMeters: route.distanceMeters,
      durationSeconds: parseInt(route.duration.replace('s', '')),
      encodedPolyline: route.polyline.encodedPolyline,
      provider: "google"
    }), { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: getCorsHeaders(req) });
  }
})
