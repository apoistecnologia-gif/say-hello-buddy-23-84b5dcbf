import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const config = readFileSync("supabase/config.toml", "utf8");
const logo = readFileSync("supabase/functions/pagbank-apois-logo/index.ts", "utf8");
const callback = readFileSync("supabase/functions/pagbank-connect-callback/index.ts", "utf8");

describe("PagBank runtime endpoints", () => {
  test("keeps authenticated checkout and public provider callbacks separated", () => {
    expect(config).toContain("[functions.ride-pix-checkout]\nverify_jwt = true");
    expect(config).toContain("[functions.pagbank-create-ride-pix]\nverify_jwt = true");
    expect(config).toContain("[functions.pagbank-webhook]\nverify_jwt = false");
    expect(config).toContain("[functions.pagbank-connect-callback]\nverify_jwt = false");
    expect(config).toContain("[functions.pagbank-apois-logo]\nverify_jwt = false");
  });

  test("logo endpoint stays available when the upstream website asset fails", () => {
    expect(logo).toContain("FALLBACK_SVG");
    expect(logo).toContain("return fallbackResponse(req.method)");
    expect(logo).toContain('status: 200');
  });

  test("OAuth callback never echoes the authorization code", () => {
    expect(callback).toContain('const code = url.searchParams.get("code")');
    expect(callback).toContain('status: "authorization_received"');
    expect(callback).not.toContain('code,\n        state');
  });
});
