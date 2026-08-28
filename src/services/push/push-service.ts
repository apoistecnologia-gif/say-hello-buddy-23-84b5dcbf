import { Capacitor } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { resolvePushTarget, type PushTarget } from "./push-events";

export type PushStatus =
  | "unsupported" // navegador / preview web
  | "idle"
  | "prompt" // permissão ainda não concedida
  | "granted"
  | "denied"
  | "error";

export interface PushState {
  status: PushStatus;
  token: string | null;
  platform: "android" | "ios" | "web";
  lastError: string | null;
}

type Listener = (state: PushState) => void;

const DEVICE_ID_KEY = "apois-push-device-id";
const RIDES_CHANNEL_ID = "apois_rides";

const isNative = () => Capacitor.isNativePlatform();

const currentPlatform = (): PushState["platform"] => {
  const platform = Capacitor.getPlatform();
  return platform === "android" || platform === "ios" ? platform : "web";
};

let state: PushState = {
  status: isNative() ? "idle" : "unsupported",
  token: null,
  platform: currentPlatform(),
  lastError: null,
};

const listeners = new Set<Listener>();
let handles: PluginListenerHandle[] = [];
let initializing: Promise<PushState> | null = null;
let initialized = false;
let initializedForAuthUserId: string | null = null;
let activeAuthUserId: string | null = null;
let lifecycleVersion = 0;
let navigateHandler: ((target: PushTarget) => void) | null = null;

const setState = (patch: Partial<PushState>) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener(state));
};

const isCurrentLifecycle = (version: number): boolean => version === lifecycleVersion;

export const getPushState = (): PushState => state;

export const subscribeToPushState = (listener: Listener): (() => void) => {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
};

export const setPushNavigationHandler = (handler: ((target: PushTarget) => void) | null) => {
  navigateHandler = handler;
};

export const getDeviceId = (): string => {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const generated =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(DEVICE_ID_KEY, generated);
    return generated;
  } catch {
    return "unknown-device";
  }
};

const loadPlugin = async () => {
  const mod = await import("@capacitor/push-notifications");
  return mod.PushNotifications;
};

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

export const deactivateToken = async (token?: string | null): Promise<void> => {
  const target = token ?? state.token;
  if (!target) return;

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;

  const { error } = await supabase.rpc("deactivate_notification_token", { _token: target });
  if (error) console.warn("[push] Falha ao desativar token", error.message);
};

const persistToken = async (
  token: string,
  permission: "granted" | "provisional",
  version: number,
) => {
  const expectedAuthUserId = activeAuthUserId;
  if (!expectedAuthUserId || !isCurrentLifecycle(version)) return;

  const { data: sessionData } = await supabase.auth.getSession();
  if (
    !sessionData.session ||
    sessionData.session.user.id !== expectedAuthUserId ||
    activeAuthUserId !== expectedAuthUserId ||
    !isCurrentLifecycle(version)
  ) {
    return;
  }

  const previous = state.token;
  if (previous && previous !== token) {
    await deactivateToken(previous);
  }

  if (activeAuthUserId !== expectedAuthUserId || !isCurrentLifecycle(version)) return;

  const { error } = await supabase.rpc("register_notification_token", {
    _token: token,
    _platform: state.platform === "ios" ? "ios" : "android",
    _device_id: getDeviceId(),
    _permission_status: permission,
  });

  if (activeAuthUserId !== expectedAuthUserId || !isCurrentLifecycle(version)) return;

  if (error) {
    console.warn("[push] Falha ao registrar token", error.message);
    setState({ lastError: "Não foi possível sincronizar o dispositivo." });
    return;
  }

  setState({ token, status: "granted", lastError: null });
};

const ensureAndroidChannel = async () => {
  if (state.platform !== "android") return;
  const PushNotifications = await loadPlugin();
  try {
    await PushNotifications.createChannel({
      id: RIDES_CHANNEL_ID,
      name: "Corridas APOIS",
      description: "Atualizações da sua corrida em tempo real",
      importance: 5,
      sound: "default",
      vibration: true,
      visibility: 0,
      lights: true,
    });
  } catch (err) {
    console.warn("[push] Não foi possível criar o canal Android", err);
  }
};

const removeHandles = async (targets: PluginListenerHandle[]) => {
  for (const handle of targets) {
    try {
      await handle.remove();
    } catch {
      /* noop */
    }
  }
};

const attachListeners = async (version: number) => {
  const PushNotifications = await loadPlugin();
  if (handles.length > 0 || !isCurrentLifecycle(version)) return;

  const nextHandles = await Promise.all([
    PushNotifications.addListener("registration", (token) => {
      if (!isCurrentLifecycle(version)) return;
      void persistToken(token.value, "granted", version);
    }),
    PushNotifications.addListener("registrationError", (err) => {
      if (!isCurrentLifecycle(version)) return;
      console.warn("[push] Erro de registro", err);
      setState({ status: "error", lastError: "Registro de notificações indisponível." });
    }),
    PushNotifications.addListener("pushNotificationReceived", (notification) => {
      if (!isCurrentLifecycle(version)) return;
      // App em primeiro plano: apenas telemetria local, sem interromper o usuário.
      console.info("[push] Notificação recebida", notification.title ?? "");
    }),
    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      if (!isCurrentLifecycle(version)) return;
      const target = resolvePushTarget(toRecord(action.notification.data));
      navigateHandler?.(target);
    }),
  ]);

  if (!isCurrentLifecycle(version)) {
    await removeHandles(nextHandles);
    return;
  }

  handles = nextHandles;
};

/**
 * Inicializa o push para a sessão autenticada informada. A associação ao
 * auth user impede que um token ou listeners sobrevivam silenciosamente à
 * troca de conta no mesmo aparelho.
 */
export const initializePush = async (authUserId: string): Promise<PushState> => {
  const normalizedAuthUserId = authUserId.trim();
  if (!normalizedAuthUserId) return state;

  activeAuthUserId = normalizedAuthUserId;

  if (!isNative()) {
    setState({ status: "unsupported", platform: "web" });
    return state;
  }

  if (initialized && initializedForAuthUserId === normalizedAuthUserId) {
    if (state.token) {
      await persistToken(state.token, "granted", lifecycleVersion);
    }
    return state;
  }

  if (initialized) {
    initializedForAuthUserId = normalizedAuthUserId;
    if (state.token) {
      await persistToken(state.token, "granted", lifecycleVersion);
    } else {
      const PushNotifications = await loadPlugin();
      await PushNotifications.register();
    }
    return state;
  }

  if (initializing) return initializing;

  const version = ++lifecycleVersion;
  initializing = (async () => {
    try {
      const PushNotifications = await loadPlugin();

      // A autorização precisa acontecer antes de canal/listeners/registro.
      // Assim, uma falha posterior de configuração do FCM não impede o
      // Android 13+ de exibir o diálogo nativo de notificações.
      let permission = await PushNotifications.checkPermissions();
      if (!isCurrentLifecycle(version)) return state;

      if (permission.receive === "prompt" || permission.receive === "prompt-with-rationale") {
        setState({ status: "prompt", lastError: null });
        permission = await PushNotifications.requestPermissions();
      }
      if (!isCurrentLifecycle(version)) return state;

      if (permission.receive === "denied") {
        setState({ status: "denied", lastError: null });
        return state;
      }

      if (permission.receive !== "granted") {
        setState({ status: "prompt", lastError: null });
        return state;
      }

      await ensureAndroidChannel();
      if (!isCurrentLifecycle(version)) return state;

      await attachListeners(version);
      if (!isCurrentLifecycle(version)) return state;

      await PushNotifications.register();
      if (!isCurrentLifecycle(version)) return state;

      setState({ status: "granted", lastError: null });
      initialized = true;
      initializedForAuthUserId = activeAuthUserId;
      return state;
    } catch (err) {
      if (isCurrentLifecycle(version)) {
        console.warn("[push] Inicialização falhou", err);
        setState({ status: "error", lastError: "Notificações indisponíveis neste dispositivo." });
      }
      return state;
    } finally {
      if (isCurrentLifecycle(version)) initializing = null;
    }
  })();

  return initializing;
};

/** Remove listeners e desativa o token atual (usado no logout/troca de sessão). */
export const teardownPush = async (): Promise<void> => {
  const tokenToDeactivate = state.token;

  // Invalida imediatamente callbacks e inicializações que ainda estejam em andamento.
  lifecycleVersion += 1;
  activeAuthUserId = null;
  initializedForAuthUserId = null;
  initialized = false;
  initializing = null;

  try {
    await deactivateToken(tokenToDeactivate);
  } finally {
    const previousHandles = handles;
    handles = [];
    await removeHandles(previousHandles);
    setState({ token: null, status: isNative() ? "idle" : "unsupported", lastError: null });
  }
};
