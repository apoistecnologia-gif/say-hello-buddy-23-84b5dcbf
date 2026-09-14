import { describe, expect, test } from "bun:test";
import {
  isPushRideEvent,
  normalizePushEvent,
  resolvePushTarget,
  sanitizeInternalPath,
} from "../src/services/push/push-events";

const RIDE_ID = "11111111-1111-1111-1111-111111111111";

describe("push/deep-link contract", () => {
  test("normaliza aliases do backend e rejeita evento desconhecido", () => {
    expect(normalizePushEvent("ride.accepted")).toBe("driver_assigned");
    expect(normalizePushEvent("ride.completed")).toBe("ride_completed");
    expect(normalizePushEvent("driver.new_ride_request")).toBe("ride_requested");
    expect(normalizePushEvent("unknown.event")).toBeNull();
    expect(isPushRideEvent(null)).toBe(false);
  });

  test("bloqueia URLs externas e esquemas não permitidos", () => {
    for (const value of [
      "https://evil.example/corridas",
      "http://evil.example",
      "javascript:alert(1)",
      "apois://corridas",
      "//evil.example/corridas",
      "corridas",
    ]) {
      expect(sanitizeInternalPath(value)).toBeNull();
    }
  });

  test("aceita somente rotas internas estáticas e corrida com UUID", () => {
    expect(sanitizeInternalPath("#/corridas?from=push")).toBe("/corridas");
    expect(sanitizeInternalPath(`/corrida/${RIDE_ID}/`)).toBe(`/corrida/${RIDE_ID}`);
    expect(sanitizeInternalPath("/corrida/not-a-uuid")).toBeNull();
    expect(sanitizeInternalPath("/admin")).toBeNull();
  });

  test("prioriza caminho seguro e faz fallback por evento", () => {
    expect(resolvePushTarget({ path: "/perfil", event: "ride.cancelled" })).toEqual({ path: "/perfil" });
    expect(resolvePushTarget({ path: "https://evil.example", event: "ride.cancelled" })).toEqual({ path: "/corridas" });
    expect(resolvePushTarget({ event: "ride.cancellation_fee_created", ride_id: RIDE_ID })).toEqual({ path: "/carteira" });
    expect(resolvePushTarget({ event: "ride.accepted", ride_id: RIDE_ID })).toEqual({ path: `/corrida/${RIDE_ID}` });
  });

  test("payload vazio ou desconhecido cai em notificações", () => {
    expect(resolvePushTarget(null)).toEqual({ path: "/notificacoes" });
    expect(resolvePushTarget({ event: "unknown.event" })).toEqual({ path: "/notificacoes" });
  });
});
