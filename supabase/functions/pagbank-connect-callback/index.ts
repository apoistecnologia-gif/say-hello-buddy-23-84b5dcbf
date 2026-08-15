const securityHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "content-type",
      },
    });
  }

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "method_not_allowed" }),
      { status: 405, headers: securityHeaders },
    );
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    console.warn("PagBank Connect callback returned an OAuth error", {
      error,
      hasDescription: Boolean(errorDescription),
    });

    return new Response(
      JSON.stringify({
        ok: false,
        provider: "pagbank",
        error,
        error_description: errorDescription ?? undefined,
      }),
      { status: 400, headers: securityHeaders },
    );
  }

  if (!code && !state) {
    return new Response(
      JSON.stringify({
        ok: true,
        provider: "pagbank",
        endpoint: "connect_callback",
        status: "ready",
      }),
      { status: 200, headers: securityHeaders },
    );
  }

  if (!code || !state) {
    return new Response(
      JSON.stringify({
        ok: false,
        provider: "pagbank",
        error: "invalid_callback",
        message: "OAuth callback must contain both code and state.",
      }),
      { status: 400, headers: securityHeaders },
    );
  }

  // The authorization code is intentionally not logged or echoed back.
  // Token exchange will be added after the Sandbox application returns
  // the client credentials required by PagBank Connect.
  console.info("PagBank Connect authorization callback received", {
    hasCode: true,
    hasState: true,
  });

  return new Response(
    JSON.stringify({
      ok: true,
      provider: "pagbank",
      status: "authorization_received",
    }),
    { status: 200, headers: securityHeaders },
  );
});
