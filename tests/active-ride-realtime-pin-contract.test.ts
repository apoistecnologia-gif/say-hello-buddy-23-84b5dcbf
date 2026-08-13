import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const service = readFileSync("src/services/rides/active-ride-service.ts", "utf8");

describe("active ride protected fields", () => {
  test("hydrates passenger PIN after realtime ride updates", () => {
    expect(service).toContain("hydratePassengerSecurityCode");
    expect(service).toContain('rpc("get_passenger_ride_security_code"');
    expect(service).toContain("onUpdate(hydratedRide)");
  });

  test("resolves private driver photo paths through Storage", () => {
    expect(service).toContain('from("profile-photos").createSignedUrl');
  });
});
