import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("Woovi webhook dispatch contract", () => {
  test("reuses the canonical paid Pix dispatch boundary", () => {
    const webhook = readFileSync("supabase/functions/woovi-webhook/index.ts", "utf8");

    expect(webhook).toContain('/functions/v1/passenger-ride-request');
    expect(webhook).toContain('action: "dispatch_paid_pix"');
    expect(webhook).toContain('ride_id: rideId');
    expect(webhook).toContain('await dispatchPaidPix(payment.ride_id)');

    // passenger-ride-request owns the initial claim. Claiming in the webhook
    // first would make the canonical dispatcher see an already-claimed ride
    // and skip the actual driver search.
    expect(webhook).not.toContain('admin.rpc("claim_prepaid_pix_initial_dispatch"');
    expect(webhook).not.toContain('/functions/v1/process-ride-dispatch');
  });
});
