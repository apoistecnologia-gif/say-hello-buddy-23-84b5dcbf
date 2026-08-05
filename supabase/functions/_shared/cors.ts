/**
 * APOIS Edge Function CORS Helper
 * 
 * Provides strict origin validation for browser-callable functions.
 * Webhooks (like Mercado Pago) do not require browser CORS as they are server-to-server;
 * their protection is signature validation, not CORS.
 */

const ALLOWED_ORIGIN_SUFFIXES = [
  ".lovable.app",
];

const ALLOWED_EXACT_ORIGINS = [
  "https://say-hello-buddy-23.lovable.app",
  "http://localhost:8080",
];

export function getCorsHeaders(request: Request) {
  const origin = request.headers.get("Origin");
  const envAllowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map(o => o.trim()).filter(Boolean);
  
  const allExactOrigins = [...ALLOWED_EXACT_ORIGINS, ...envAllowedOrigins];
  
  // 1. If no Origin header, support Capacitor/trusted server-to-server
  if (!origin) {
    return {
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-request-id",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    };
  }

  // 2. Validate exact matches
  let isAllowed = allExactOrigins.includes(origin);

  // 3. Validate suffix matches (safe hostname validation)
  if (!isAllowed) {
    try {
      const url = new URL(origin);
      // Hostname suffix validation: exactly matches .lovable.app
      isAllowed = ALLOWED_ORIGIN_SUFFIXES.some(suffix => url.hostname.endsWith(suffix) && url.protocol === "https:");
    } catch {
      isAllowed = false;
    }
  }

  // 4. Return exact origin only if allowed, otherwise omit Access-Control-Allow-Origin
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-request-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (isAllowed) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

