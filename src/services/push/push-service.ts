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
let navigateHandler: ((target: PushTarget) => void) | null = null;

const setState = (patch: Partial<PushState>) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener(state));
};

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

const persistToken = async (token: string, permission: "granted" | "provisional") => {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;

  const previous = state.token;
  if (previous && previous !== token) {
    await deactivateToken(previous);
  }

  const { error } = await supabase.rpc("register_notification_token", {
    _token: token,
    _platform: state.platform === "ios" ? "ios" : "android",
    _device_id: getDeviceId(),
    _permission_status: permission,
  });

  if (error) {
    console.warn("[push] Falha ao registrar token", error.message);
    setState({ lastError: "Não foi possível sincronizar o dispositivo." });
    return;
  }

  setState({ token, status: "granted", lastError: null });
};

export const deactivateToken = async (token?: string | null): Promise<void> => {
  const target = token ?? state.token;
  if (!target) return;
  const { error } = await supabase.rpc("deactivate_notification_token", { _token: target });
  if (error) console.warn("[push] Falha ao desativar token", error.message);
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

const attachListeners = async () => {
  const PushNotifications = await loadPlugin();
  if (handles.length > 0) return;

  handles = await Promise.all([
    PushNotifications.addListener("registration", (token) => {
      void persistToken(token.value, "granted");
    }),
    PushNotifications.addListener("registrationError", (err) => {
      console.warn("[push] Erro de registro", err);
      setState({ status: "error", lastError: "Registro de notificações indisponível." });
    }),
    PushNotifications.addListener("pushNotificationReceived", (notification) => {
      // App em primeiro plano: apenas telemetria local, sem interromper o usuário.
      console.info("[push] Notificação recebida", notification.title ?? "");
    }),
    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const target = resolvePushTarget(toRecord(action.notification.data));
      navigateHandler?.(target);
    }),
  ]);
};

/**
 * Inicializa o push. Seguro em qualquer plataforma: no navegador/preview
 * apenas marca o estado como "unsupported" e não lança erro.
 * Deve ser chamado somente após a sessão autenticada.
 */
export const initializePush = async (): Promise<PushState> => {
  if (!isNative()) {
    setState({ status: "unsupported", platform: "web" });
    return state;
  }
  if (initialized) return state;
  if (initializing) return initializing;

  initializing = (async () => {
    try {
      const PushNotifications = await loadPlugin();
      await ensureAndroidChannel();
      await attachListeners();

      let permission = await PushNotifications.checkPermissions();
      if (permission.receive === "prompt" || permission.receive === "prompt-with-rationale") {
        permission = await PushNotifications.requestPermissions();
      }

      if (permission.receive === "denied") {
        setState({ status: "denied", lastError: null });
        return state;
      }

      if (permission.receive !== "granted") {
        setState({ status: "prompt", lastError: null });
        return state;
      }

      await PushNotifications.register();
      setState({ status: "granted", lastError: null });
      initialized = true;
      return state;
    } catch (err) {
      console.warn("[push] Inicialização falhou", err);
      setState({ status: "error", lastError: "Notificações indisponíveis neste dispositivo." });
      return state;
    } finally {
      initializing = null;
    }
  })();

  return initializing;
};

/** Remove listeners e desativa o token atual (usado no logout). */
export const teardownPush = async (): Promise<void> => {
  try {
    await deactivateToken();
  } finally {
    for (const handle of handles) {
      try {
        await handle.remove();
      } catch {
        /* noop */
      }
    }
    handles = [];
    initialized = false;
    initializing = null;
    setState({ token: null, status: isNative() ? "idle" : "unsupported", lastError: null });
  }
};
