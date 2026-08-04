export const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Will be refined in the function itself if needed, but Supabase standard often uses * or specific list
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const ALLOWED_ORIGINS = [
  "https://say-hello-buddy-23.lovable.app",
  "https://preview--say-hello-buddy-23.lovable.app",
  "https://say-hello-buddy-23-84b5dcbf.lovable.app",
  "http://localhost:8080",
  "http://localhost:3000",
];

export function getCorsHeaders(request: Request) {
  const origin = request.headers.get("Origin");
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return {
      ...corsHeaders,
      "Access-Control-Allow-Origin": origin,
    };
  }
  return corsHeaders;
}
