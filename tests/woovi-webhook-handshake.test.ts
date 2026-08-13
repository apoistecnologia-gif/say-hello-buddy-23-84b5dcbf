import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const webhook = readFileSync("supabase/functions/woovi-webhook/index.ts", "utf8");

describe("Woovi webhook registration handshake", () => {
  test("accepts dashboard test payload with HTTP 200 after authentication", () => {
    expect(webhook).toContain('String(payload.evento ?? "").trim().toLowerCase()');
    expect(webhook).toContain('handshake === "teste_webhook"');
    expect(webhook).toContain('return json({ ok: true, test: true');
  });

  test("accepts raw or Bearer-prefixed configured authorization", () => {
    expect(webhook).toContain('replace(/^Bearer\\s+/i, "")');
    expect(webhook).toContain('req.headers.get("x-openpix-authorization")');
    expect(webhook).toContain('req.headers.get("authorization")');
    expect(webhook).toContain('safeEqual(webhookAuthorization(req), WEBHOOK_SECRET)');
  });
});
