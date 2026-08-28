/**
 * APOIS Edge Function CORS helper.
 *
 * Web origins must be explicitly configured through ALLOWED_ORIGINS. The
 * Capacitor/Ionic application uses a local virtual origin even in production,
 * so only the exact native origins below are trusted without depending on an
 * environment secret.
 */

const ENVIRONMENT =
  Deno.env.get("APP_ENV") ??
  Deno.env.get("ENVIRONMENT") ??
  "production";

const ALLOWED_METHODS = "GET, POST, OPTIONS";
const ALLOWED_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-signature, x-request-id";

const NATIVE_ORIGINS = new Set([
  "https://localhost",
  "capacitor://localhost",
  "ionic://localhost",
]);

function configuredOrigins(): Set<string> {
  return new Set(
    (Deno.env.get("ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );
}

export function getCorsHeaders(request: Request): Record<string, string> {
  const originHeader = request.headers.get("Origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };

  if (!originHeader) return headers;

  const origin = originHeader.replace(/\/$/, "");
  const allowedOrigins = configuredOrigins();
  let allowed = NATIVE_ORIGINS.has(origin) || allowedOrigins.has(origin);

  try {
    const url = new URL(origin);
    const localDevelopment =
      ENVIRONMENT === "development" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");

    if (localDevelopment) allowed = true;

    if (allowed && ENVIRONMENT !== "development" && !NATIVE_ORIGINS.has(origin)) {
      // Configured web origins must still be HTTPS in production.
      allowed = url.protocol === "https:";
    }
  } catch {
    allowed = false;
  }

  if (allowed) headers["Access-Control-Allow-Origin"] = originHeader;
  return headers;
}
