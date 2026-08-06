/**
 * APOIS Edge Function CORS helper.
 *
 * Browser and Capacitor calls are accepted only when the exact Origin appears
 * in the ALLOWED_ORIGINS secret. Requests without Origin remain supported for
 * trusted server-to-server integrations.
 */

const ENVIRONMENT =
  Deno.env.get("APP_ENV") ??
  Deno.env.get("ENVIRONMENT") ??
  "production";

const ALLOWED_METHODS = "GET, POST, OPTIONS";
const ALLOWED_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-signature, x-request-id";

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
  let allowed = allowedOrigins.has(origin);

  try {
    const url = new URL(origin);
    const localDevelopment =
      ENVIRONMENT === "development" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");

    if (localDevelopment) allowed = true;

    if (allowed && ENVIRONMENT !== "development") {
      const explicitlyAllowedNativeOrigin =
        allowedOrigins.has(origin) &&
        (url.hostname === "localhost" ||
          url.hostname === "127.0.0.1" ||
          url.protocol === "capacitor:" ||
          url.protocol === "ionic:");
      const secureWebOrigin = url.protocol === "https:";
      allowed = secureWebOrigin || explicitlyAllowedNativeOrigin;
    }
  } catch {
    allowed = false;
  }

  if (allowed) headers["Access-Control-Allow-Origin"] = originHeader;
  return headers;
}
