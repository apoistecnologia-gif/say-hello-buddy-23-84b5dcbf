const LOGO_SOURCE = "https://apoisbrasil.com.br/__l5e/assets-v1/543751d4-7a65-440f-83ec-59159078d70c/apois-logo.png";

Deno.serve(async (req: Request) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { "allow": "GET, HEAD" },
    });
  }

  try {
    const upstream = await fetch(LOGO_SOURCE, {
      headers: { "accept": "image/png,image/*;q=0.8,*/*;q=0.5" },
      redirect: "follow",
    });

    if (!upstream.ok) {
      console.error("Unable to fetch APOIS logo", { status: upstream.status });
      return new Response("Logo unavailable", { status: 502 });
    }

    const contentType = upstream.headers.get("content-type") ?? "image/png";
    if (!contentType.toLowerCase().startsWith("image/")) {
      console.error("Unexpected logo content type", { contentType });
      return new Response("Invalid logo source", { status: 502 });
    }

    const headers = new Headers({
      "content-type": contentType,
      "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "x-content-type-options": "nosniff",
      "access-control-allow-origin": "*",
    });

    if (req.method === "HEAD") {
      return new Response(null, { status: 200, headers });
    }

    return new Response(await upstream.arrayBuffer(), { status: 200, headers });
  } catch (error) {
    console.error("APOIS logo proxy failure", {
      message: error instanceof Error ? error.message : String(error),
    });
    return new Response("Logo unavailable", { status: 502 });
  }
});
