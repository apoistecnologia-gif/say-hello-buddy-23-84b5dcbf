import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  isRideCategoryEnabled,
  parseRideFeatureFlags,
} from "../src/lib/rideFeatureFlags.core.ts";

describe("ride feature flags", () => {
  test("hides Guincho and Fretes while both server flags are false", () => {
    const flags = parseRideFeatureFlags({
      feature_guincho_enabled: false,
      feature_fretes_enabled: "false",
    });
    assert.equal(isRideCategoryEnabled("guincho", flags), false);
    assert.equal(isRideCategoryEnabled("fretes", flags), false);
  });

  test("keeps Carro, Moto and Entregas available", () => {
    const flags = parseRideFeatureFlags(null);
    assert.equal(isRideCategoryEnabled("carros", flags), true);
    assert.equal(isRideCategoryEnabled("motos", flags), true);
    assert.equal(isRideCategoryEnabled("envios", flags), true);
  });

  test("allows a gated category only after an explicit true flag", () => {
    const flags = parseRideFeatureFlags({
      feature_guincho_enabled: true,
      feature_fretes_enabled: "true",
    });
    assert.equal(isRideCategoryEnabled("guincho", flags), true);
    assert.equal(isRideCategoryEnabled("fretes", flags), true);
  });
});
