import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  getPushState,
  initializePush,
  setPushNavigationHandler,
  subscribeToPushState,
  type PushState,
} from "@/services/push/push-service";

/**
 * Integra o push ao ciclo de vida autenticado.
 * Só registra o dispositivo após a sessão existir e nunca duplica listeners.
 */
export const usePushNotifications = (): PushState => {
  const { user, authState } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<PushState>(() => getPushState());
  const startedForUser = useRef<string | null>(null);

  useEffect(() => subscribeToPushState(setState), []);

  useEffect(() => {
    setPushNavigationHandler((target) => {
      void navigate({ to: target.path });
    });
    return () => setPushNavigationHandler(null);
  }, [navigate]);

  useEffect(() => {
    if (authState !== "authenticated" || !user?.id) return;
    if (startedForUser.current === user.id) return;
    startedForUser.current = user.id;
    void initializePush();
  }, [authState, user?.id]);

  return state;
};

/** Rótulo amigável do estado de push, sem jargão técnico. */
export const usePushStatusLabel = (): { title: string; tone: "ok" | "muted" | "warn" } => {
  const { status } = usePushNotifications();

  return useCallback((): { title: string; tone: "ok" | "muted" | "warn" } => {
    switch (status) {
      case "granted":
        return { title: "Notificações ativas neste dispositivo", tone: "ok" };
      case "denied":
        return { title: "Notificações desativadas nas configurações do celular", tone: "warn" };
      case "unsupported":
        return { title: "Notificações push disponíveis apenas no aplicativo", tone: "muted" };
      case "error":
        return { title: "Notificações indisponíveis no momento", tone: "muted" };
      default:
        return { title: "Preparando notificações…", tone: "muted" };
    }
  }, [status])();
};
