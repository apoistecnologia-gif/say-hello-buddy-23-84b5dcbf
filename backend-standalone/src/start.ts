import { createStart, createMiddleware } from "@tanstack/react-start";

const APK_ORIGINS = new Set(["capacitor://localhost", "https://localhost", "http://localhost"]);

const corsMiddleware = createMiddleware({ type: "request" }).server(async ({ next, request }) => {
  const origin = request.headers.get("origin") ?? "";
  const allow = APK_ORIGINS.has(origin) || origin.endsWith(".lovable.app");
  if (request.method === "OPTIONS" && allow) {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "content-type, authorization, x-client-info, apikey",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  const res = await next();
  if (allow) {
    res.response.headers.set("Access-Control-Allow-Origin", origin);
    res.response.headers.set("Access-Control-Allow-Credentials", "true");
    res.response.headers.set("Vary", "Origin");
  }
  return res;
});

export const startInstance = createStart(() => ({
  requestMiddleware: [corsMiddleware],
  functionMiddleware: [],
}));
