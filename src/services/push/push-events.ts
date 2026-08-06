/**
 * Eventos de push suportados pelo APOIS Passageiro e o destino interno de cada um.
 * Nenhuma URL externa é aceita: o clique na notificação só pode abrir rotas internas.
 */

export const PUSH_RIDE_EVENTS = [
  "ride_requested",
  "driver_assigned",
  "driver_arriving",
  "driver_arrived",
  "ride_started",
  "ride_completed",
  "ride_cancelled",
  "cancellation_fee_created",
] as const;

export type PushRideEvent = (typeof PUSH_RIDE_EVENTS)[number];

export const isPushRideEvent = (value: unknown): value is PushRideEvent =>
  typeof value === "string" && (PUSH_RIDE_EVENTS as readonly string[]).includes(value);

/** Rotas internas que uma notificação pode abrir. */
const ALLOWED_STATIC_ROUTES = new Set<string>([
  "/inicio",
  "/corridas",
  "/carteira",
  "/perfil",
  "/notificacoes",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PushTarget {
  path: string;
}

const rideTarget = (rideId: unknown): PushTarget => {
  if (typeof rideId === "string" && UUID_RE.test(rideId)) {
    return { path: `/corrida/${rideId}` };
  }
  return { path: "/corridas" };
};

/**
 * Resolve o destino de navegação de forma segura.
 * Aceita `data.event` conhecido, ou `data.path`/`data.deeplink` apontando para rota interna.
 * Qualquer URL externa (http, javascript, esquema custom) é bloqueada.
 */
export const resolvePushTarget = (data: Record<string, unknown> | undefined | null): PushTarget => {
  const payload = data ?? {};

  const rawPath =
    typeof payload["path"] === "string"
      ? payload["path"]
      : typeof payload["deeplink"] === "string"
        ? payload["deeplink"]
        : null;

  if (rawPath) {
    const candidate = sanitizeInternalPath(rawPath);
    if (candidate) return { path: candidate };
  }

  const event = payload["event"];
  if (isPushRideEvent(event)) {
    switch (event) {
      case "cancellation_fee_created":
        return { path: "/carteira" };
      case "ride_completed":
      case "ride_cancelled":
        return { path: "/corridas" };
      default:
        return rideTarget(payload["ride_id"] ?? payload["rideId"]);
    }
  }

  return { path: "/notificacoes" };
};

/** Normaliza e valida um caminho interno; retorna null se não for permitido. */
export const sanitizeInternalPath = (value: string): string | null => {
  let candidate = value.trim();
  if (!candidate) return null;

  // Bloqueia qualquer coisa com esquema/host (http://, javascript:, apois://, //evil.com)
  if (/^[a-z][a-z0-9+.-]*:/i.test(candidate)) return null;
  if (candidate.startsWith("//")) return null;

  // Aceita formato de hash history usado pelo app: "#/corridas"
  if (candidate.startsWith("#")) candidate = candidate.slice(1);
  if (!candidate.startsWith("/")) return null;

  // Remove query/hash residual e barras finais
  candidate = candidate.split("?")[0]!.split("#")[0]!;
  if (candidate.length > 1 && candidate.endsWith("/")) candidate = candidate.slice(0, -1);

  if (ALLOWED_STATIC_ROUTES.has(candidate)) return candidate;

  const rideMatch = /^\/corrida\/([^/]+)$/.exec(candidate);
  if (rideMatch && UUID_RE.test(rideMatch[1]!)) return candidate;

  return null;
};
