import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  getPushState,
  initializePush,
  setPushNavigationHandler,
  subscribeToPushState,
  teardownPush,
  type PushState,
} from "@/services/push/push-service";

/**
 * Integra o push ao ciclo de vida autenticado.
 * Registra o dispositivo somente depois da sessão existir e reinicia o
 * serviço quando a conta muda ou deixa de estar autenticada.
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
    let cancelled = false;

    const syncPushSession = async () => {
      const nextUserId = authState === "authenticated" ? (user?.id ?? null) : null;
      const previousUserId = startedForUser.current;

      if (!nextUserId) {
        if (previousUserId) {
          startedForUser.current = null;
          await teardownPush();
        }
        return;
      }

      if (previousUserId === nextUserId) return;

      if (previousUserId) {
        startedForUser.current = null;
        await teardownPush();
        if (cancelled) return;
      }

      startedForUser.current = nextUserId;
      await initializePush(nextUserId);
    };

    void syncPushSession();
    return () => {
      cancelled = true;
    };
  }, [authState, user?.id]);

  return state;
};
