const ALLOWED_ORIGINS = [
  "https://say-hello-buddy-23.lovable.app",
  "https://preview--say-hello-buddy-23.lovable.app",
];

export function getCorsHeaders(request: Request) {
  const origin = request.headers.get("Origin");
  const isAllowed = origin && ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin! : "https://say-hello-buddy-23.lovable.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-request-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
