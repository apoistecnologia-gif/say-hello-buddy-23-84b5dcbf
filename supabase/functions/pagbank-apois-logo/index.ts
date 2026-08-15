const LOGO_SOURCE = "https://apoisbrasil.com.br/__l5e/assets-v1/543751d4-7a65-440f-83ec-59159078d70c/apois-logo.png";

const FALLBACK_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="APOIS">
  <rect width="512" height="512" rx="96" fill="#050505"/>
  <path d="M256 80 130 332h66l60-128 60 128h66L256 80Z" fill="#FFB800"/>
  <path d="M213 278h86l27 54H186l27-54Z" fill="#050505"/>
  <circle cx="256" cy="348" r="25" fill="#FFB800"/>
  <circle cx="256" cy="348" r="10" fill="#050505"/>
  <text x="256" y="420" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="58" font-weight="800" letter-spacing="5" fill="#FFFFFF">APOIS</text>
  <text x="256" y="456" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="700" letter-spacing="8" fill="#FFB800">VAMO</text>
</svg>`;

function fallbackHeaders() {
  return new Headers({
    "content-type": "image/svg+xml; charset=utf-8",
    "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    "x-content-type-options": "nosniff",
    "access-control-allow-origin": "*",
  });
}

function fallbackResponse(method: string) {
  const headers = fallbackHeaders();
  return method === "HEAD"
    ? new Response(null, { status: 200, headers })
    : new Response(FALLBACK_SVG, { status: 200, headers });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { allow: "GET, HEAD" },
    });
  }

  try {
    const upstream = await fetch(LOGO_SOURCE, {
      headers: { accept: "image/png,image/*;q=0.8,*/*;q=0.5" },
      redirect: "follow",
      signal: AbortSignal.timeout(4000),
    });

    if (!upstream.ok) {
      console.warn("APOIS upstream logo unavailable; serving embedded fallback", { status: upstream.status });
      return fallbackResponse(req.method);
    }

    const contentType = upstream.headers.get("content-type") ?? "image/png";
    if (!contentType.toLowerCase().startsWith("image/")) {
      console.warn("Unexpected APOIS upstream logo content type; serving embedded fallback", { contentType });
      return fallbackResponse(req.method);
    }

    const headers = new Headers({
      "content-type": contentType,
      "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "x-content-type-options": "nosniff",
      "access-control-allow-origin": "*",
    });

    if (req.method === "HEAD") return new Response(null, { status: 200, headers });
    return new Response(await upstream.arrayBuffer(), { status: 200, headers });
  } catch (error) {
    console.warn("APOIS upstream logo fetch failed; serving embedded fallback", {
      message: error instanceof Error ? error.message : String(error),
    });
    return fallbackResponse(req.method);
  }
});
