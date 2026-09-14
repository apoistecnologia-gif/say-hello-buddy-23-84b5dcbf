import { beforeEach, describe, expect, mock, test } from "bun:test";

let nativePlatform = true;
let launchUrl: { url?: string } | null = null;
let appUrlHandler: ((event: { url: string }) => void) | null = null;
let exchangeCodeResult: { error: { message: string } | null } = { error: null };
let setSessionResult: { error: { message: string } | null } = { error: null };
let exchangeCodeCalls = 0;
let setSessionCalls = 0;

const invokeCalls: Array<{ name: string; options: unknown }> = [];
const invokeQueues = new Map<string, Array<{ data: unknown; error: { message?: string } | null }>>();
let rideQueryResult: { data: unknown; error: unknown } = { data: null, error: null };
const rideEqCalls: Array<[string, unknown]> = [];

const fakeChannel = {
  updateHandler: null as ((payload: { new: unknown }) => void) | null,
  statusHandler: null as ((status: string) => void) | null,
  on(_event: string, _filter: unknown, handler: (payload: { new: unknown }) => void) {
    this.updateHandler = handler;
    return this;
  },
  subscribe(handler: (status: string) => void) {
    this.statusHandler = handler;
    return this;
  },
};

const fakeSupabase = {
  functions: {
    async invoke(name: string, options: unknown) {
      invokeCalls.push({ name, options });
      const queue = invokeQueues.get(name) ?? [];
      return queue.shift() ?? { data: null, error: null };
    },
  },
  auth: {
    async exchangeCodeForSession(_code: string) {
      exchangeCodeCalls += 1;
      return exchangeCodeResult;
    },
    async setSession(_session: { access_token: string; refresh_token: string }) {
      setSessionCalls += 1;
      return setSessionResult;
    },
    async resetPasswordForEmail() {
      return { error: null };
    },
  },
  storage: {
    from() {
      return {
        async createSignedUrl() {
          return { data: { signedUrl: "https://signed.example/avatar" }, error: null };
        },
      };
    },
  },
  rpc: async () => ({ data: null, error: null }),
  from(table: string) {
    const builder = {
      select() {
        return this;
      },
      eq(column: string, value: unknown) {
        if (table === "rides") rideEqCalls.push([column, value]);
        return this;
      },
      in() {
        return this;
      },
      order() {
        return this;
      },
      limit() {
        return this;
      },
      async maybeSingle() {
        return rideQueryResult;
      },
    };
    return builder;
  },
  channel() {
    return fakeChannel;
  },
  async removeChannel() {
    return "ok";
  },
};

mock.module("@/integrations/supabase/client", () => ({ supabase: fakeSupabase }));
mock.module("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => nativePlatform,
  },
}));
mock.module("@capacitor/app", () => ({
  App: {
    async addListener(_event: string, handler: (event: { url: string }) => void) {
      appUrlHandler = handler;
      return { remove: async () => undefined };
    },
    async getLaunchUrl() {
      return launchUrl;
    },
  },
}));
mock.module("@capacitor/geolocation", () => ({
  Geolocation: {
    async checkPermissions() {
      return { location: "granted" };
    },
    async requestPermissions() {
      return { location: "granted" };
    },
    async getCurrentPosition() {
      return {
        coords: {
          latitude: -9.4,
          longitude: -40.5,
          accuracy: 12,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: 123,
      };
    },
    async watchPosition() {
      return "watch-1";
    },
    async clearWatch() {
      return undefined;
    },
  },
}));

const { pricingService } = await import("../src/services/pricing/pricing-service");
const { rideRequestService } = await import("../src/services/rides/ride-request-service");
const { activeRideService } = await import("../src/services/rides/active-ride-service");
const { passengerProfileService } = await import("../src/services/profile/passenger-profile-service");
const {
  consumeNativePasswordRecoveryUrl,
  registerNativePasswordRecoveryHandler,
} = await import("../src/lib/auth/native-password-recovery");
const { LocationService } = await import("../src/services/location/location-service");

const baseRide = {
  id: "11111111-1111-1111-1111-111111111111",
  passenger_id: "passenger-1",
  status: "procurar_motorista",
  category: "carros",
  origin_name: "Origem",
  destination_name: "Destino",
  origin: { lat: -9.4, lng: -40.5 },
  destination: { lat: -9.5, lng: -40.6 },
  intermediates: [],
  estimated_price: 25,
  payment_method: "cash",
  created_at: "2026-09-14T10:00:00.000Z",
  updated_at: "2026-09-14T10:00:00.000Z",
};

function queueInvoke(name: string, ...responses: Array<{ data: unknown; error: { message?: string } | null }>) {
  invokeQueues.set(name, responses);
}

beforeEach(async () => {
  invokeCalls.length = 0;
  invokeQueues.clear();
  rideEqCalls.length = 0;
  rideQueryResult = { data: null, error: null };
  exchangeCodeResult = { error: null };
  setSessionResult = { error: null };
  exchangeCodeCalls = 0;
  setSessionCalls = 0;
  nativePlatform = true;
  launchUrl = null;
  appUrlHandler = null;
  fakeChannel.updateHandler = null;
  fakeChannel.statusHandler = null;
  await activeRideService.unsubscribe();
});

describe("estimativa/preço", () => {
  test("cacheia ação equivalente e evita chamada externa duplicada", async () => {
    const request = {
      routeId: "cache-1",
      origin: { latitude: -9.4, longitude: -40.5 },
      destination: { latitude: -9.5, longitude: -40.6 },
      stops: [],
      distanceMeters: 1200,
      durationSeconds: 300,
    };
    queueInvoke("passenger-pricing-estimate", {
      data: { ok: true, currency: "BRL", estimates: [{ category_id: "carros", estimated_price: 12.5 }] },
      error: null,
    });

    const first = await pricingService.estimateFares(request);
    const second = await pricingService.estimateFares(request);

    expect(first).toEqual(second);
    expect(invokeCalls.filter((call) => call.name === "passenger-pricing-estimate")).toHaveLength(1);
  });

  test("rejeita resposta inválida e erro do Supabase", async () => {
    const invalidRequest = {
      routeId: "invalid-response",
      origin: { latitude: 1, longitude: 1 },
      destination: { latitude: 2, longitude: 2 },
      stops: [],
      distanceMeters: 10,
      durationSeconds: 20,
    };
    queueInvoke("passenger-pricing-estimate", { data: { ok: true, estimates: [{}] }, error: null });
    await expect(pricingService.estimateFares(invalidRequest)).rejects.toThrow("pricing_invalid_response");

    const errorRequest = { ...invalidRequest, routeId: "supabase-error" };
    queueInvoke("passenger-pricing-estimate", { data: null, error: { message: "backend down" } });
    await expect(pricingService.estimateFares(errorRequest)).rejects.toThrow("backend down");
  });

  test("aceita lista vazia como estado empty válido", async () => {
    const request = {
      routeId: "empty-estimates",
      origin: { latitude: 1, longitude: 1 },
      destination: { latitude: 2, longitude: 2 },
      stops: [],
      distanceMeters: 10,
      durationSeconds: 20,
    };
    queueInvoke("passenger-pricing-estimate", { data: { ok: true, estimates: [] }, error: null });
    expect((await pricingService.estimateFares(request)).estimates).toEqual([]);
  });
});

describe("solicitação e cancelamento", () => {
  test("preserva resposta idempotente reused sem efetuar pagamento real", async () => {
    queueInvoke("request-ride", {
      data: { ok: true, ride_id: baseRide.id, reused: true, status: "procurar_motorista" },
      error: null,
    });
    const result = await rideRequestService.createRide({ request_key: "same-action" } as never);
    expect(result).toMatchObject({ ok: true, rideId: baseRide.id, reused: true });
  });

  test("sessão expirada/erro Edge Function vira falha controlada", async () => {
    queueInvoke("request-ride", { data: null, error: { message: "JWT expired" } });
    const result = await rideRequestService.createRide({ request_key: "expired-session" } as never);
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("JWT expired");
  });

  test("cancelamento rejeita id vazio e propaga erro Supabase sem chamada real", async () => {
    expect(await rideRequestService.cancelRide("   ")).toMatchObject({
      ok: false,
      error_code: "invalid_ride_id",
    });
    expect(invokeCalls).toHaveLength(0);

    queueInvoke("cancel-ride", { data: null, error: { message: "cancel denied" } });
    expect(await rideRequestService.cancelRide(baseRide.id, "  mudou de ideia  ")).toMatchObject({
      ok: false,
      error_code: "cancel denied",
    });
  });
});

describe("aceite/estado/realtime", () => {
  test("busca por id sempre aplica ownership do passageiro", async () => {
    rideQueryResult = { data: null, error: null };
    await expect(activeRideService.getRideById(baseRide.id, "passenger-2")).rejects.toThrow("not_found");
    expect(rideEqCalls).toContainEqual(["id", baseRide.id]);
    expect(rideEqCalls).toContainEqual(["passenger_id", "passenger-2"]);
  });

  test("rejeita estado inválido recebido do banco", async () => {
    rideQueryResult = { data: { ...baseRide, status: "estado_inventado" }, error: null };
    await expect(activeRideService.getRideById(baseRide.id, "passenger-1")).rejects.toThrow("invalid_ride_response");
  });

  test("estado empty retorna null e erro Supabase é propagado", async () => {
    rideQueryResult = { data: null, error: null };
    expect(await activeRideService.getActiveRide("passenger-1")).toBeNull();

    rideQueryResult = { data: null, error: new Error("db unavailable") };
    await expect(activeRideService.getActiveRide("passenger-1")).rejects.toThrow("db unavailable");
  });

  test("ações permitidas mudam com estados críticos", () => {
    const searching = activeRideService.getActionAvailability("procurar_motorista", baseRide as never);
    expect(searching.canCancel).toBe(true);
    expect(searching.canRate).toBe(false);

    const completed = activeRideService.getActionAvailability(
      "finalizada",
      { ...baseRide, status: "finalizada" } as never,
    );
    expect(completed.canCancel).toBe(false);
    expect(completed.canRate).toBe(true);
    expect(completed.canViewReceipt).toBe(true);
    expect(completed.canRequestAgain).toBe(true);
  });
});

describe("auth/session e deep links", () => {
  test("sessão de recovery expirada é rejeitada de forma explícita", async () => {
    exchangeCodeResult = { error: { message: "expired" } };
    const result = await consumeNativePasswordRecoveryUrl(
      "apoispassageiro://auth/redefinir-senha?code=expired-code",
    );
    expect(result).toEqual({ handled: true, success: false, reason: "recovery_code_invalid" });
  });

  test("link externo ou inválido não é consumido", async () => {
    expect(await consumeNativePasswordRecoveryUrl("https://evil.example/reset?code=x")).toEqual({ handled: false });
    expect(await consumeNativePasswordRecoveryUrl("not a url")).toEqual({ handled: false });
  });

  test("ação duplicada do mesmo deep link é ignorada após o primeiro consumo", async () => {
    let readyCount = 0;
    const dispose = await registerNativePasswordRecoveryHandler({
      onReady: () => { readyCount += 1; },
      onError: () => undefined,
    });
    const url = "apoispassageiro://auth/redefinir-senha?code=one-shot";
    appUrlHandler?.({ url });
    await new Promise((resolve) => setTimeout(resolve, 0));
    appUrlHandler?.({ url });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(exchangeCodeCalls).toBe(1);
    expect(readyCount).toBe(1);
    await dispose();
  });
});

describe("localização", () => {
  test("classifica precisão nos limites esperados", () => {
    expect(LocationService.getAccuracyQuality(null)).toBe("none");
    expect(LocationService.getAccuracyQuality(20)).toBe("high");
    expect(LocationService.getAccuracyQuality(21)).toBe("medium");
    expect(LocationService.getAccuracyQuality(100)).toBe("medium");
    expect(LocationService.getAccuracyQuality(101)).toBe("low");
  });

  test("mapeia posição nativa sem chamada externa de mapas", async () => {
    const location = await LocationService.getCurrentPosition();
    expect(location).toMatchObject({ latitude: -9.4, longitude: -40.5, accuracy: 12 });
  });
});

describe("exclusão de conta", () => {
  test("sucesso exige ok=true e erro de backend é propagado", async () => {
    queueInvoke("delete-my-account", { data: { ok: true }, error: null });
    await expect(passengerProfileService.deleteAccount()).resolves.toBeUndefined();

    queueInvoke("delete-my-account", {
      data: { ok: false, message: "Sessão expirada" },
      error: { message: "JWT expired" },
    });
    await expect(passengerProfileService.deleteAccount()).rejects.toThrow("Sessão expirada");
  });
});
