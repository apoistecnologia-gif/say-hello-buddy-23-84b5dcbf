import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("auth/session contract", () => {
  const source = read("src/hooks/use-auth.tsx");

  test("mantém retry de perfil e estados de loading/error", () => {
    expect(source).toContain("const PROFILE_RETRY_DELAYS_MS = [0, 350, 900]");
    expect(source).toContain("for (const delay of PROFILE_RETRY_DELAYS_MS)");
    expect(source).toContain('setAuthState("connection_error")');
    expect(source).toContain("setIsLoading(true)");
    expect(source).toContain("setIsLoading(false)");
  });

  test("sessão expirada/ausente volta a unauthenticated", () => {
    expect(source).toContain("if (!nextUser)");
    expect(source).toContain('setAuthState("unauthenticated")');
    expect(source).toContain("supabase.auth.getSession()");
    expect(source).toContain("supabase.auth.onAuthStateChange");
  });
});

describe("solicitação/cancelamento backend contract", () => {
  const requestRide = read("supabase/functions/request-ride/index.ts");
  const cancelRide = read("supabase/functions/cancel-ride/index.ts");

  test("solicitação preserva chave idempotente para ação duplicada", () => {
    expect(requestRide).toContain("request_key?: string");
    expect(requestRide).toContain("request_key");
    expect(requestRide).toMatch(/reused/i);
  });

  test("cancelamento autentica e delega ownership ao RPC atômico", () => {
    expect(cancelRide).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(cancelRide).toContain("admin.auth.getUser(token)");
    expect(cancelRide).toContain('admin.rpc("service_cancel_passenger_ride"');
    expect(cancelRide).toContain("_auth_user_id: authUserId");
    expect(cancelRide).toContain("_ride_id: rideId");
  });
});

describe("estado/realtime contract", () => {
  const source = read("src/services/rides/active-ride-service.ts");
  const types = read("src/types/rides/active-ride.ts");

  test("consulta por corrida filtra ownership e realtime filtra por id", () => {
    expect(source).toContain('.eq("passenger_id", passengerId)');
    expect(source).toContain("filter: `id=eq.${rideId}`");
  });

  test("ignora payload realtime inválido e impede regressão de status antigo", () => {
    expect(source).toContain("Invalid ride update ignored");
    expect(source).toContain("STATUS_ORDER[updatedRide.status] >= STATUS_ORDER[this.lastStatus]");
    expect(source).toContain("updateTimestamp > this.lastUpdateTimestamp");
  });

  test("tipos mantêm estados loading/error/empty equivalentes", () => {
    for (const marker of [
      '"loading"',
      '"not_found"',
      '"unauthorized"',
      '"network_error"',
      '"realtime_error"',
      '"failed"',
    ]) {
      expect(types).toContain(marker);
    }
  });
});

describe("pagamento e exclusão de conta contract", () => {
  const payment = read("src/services/payments/payment-service.ts");
  const profile = read("src/services/profile/passenger-profile-service.ts");

  test("pagamento eletrônico falha fechado quando capability/Supabase falha", () => {
    expect(payment).toContain('"is_passenger_ride_pix_enabled"');
    expect(payment).toContain("return false");
    expect(payment).toContain('throw new Error("payment_methods_unavailable")');
    expect(payment).toContain('new Set<PaymentMethodCode>(["pix"])');
  });

  test("exclusão exige confirmação ok=true do backend", () => {
    expect(profile).toContain('supabase.functions.invoke("delete-my-account"');
    expect(profile).toContain('data["ok"] !== true');
    expect(profile).toContain("Não foi possível excluir sua conta agora.");
  });
});
