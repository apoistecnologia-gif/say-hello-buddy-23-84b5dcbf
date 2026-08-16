import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  Car,
  CheckCheck,
  ChevronRight,
  Loader2,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { PushStatusCard } from "@/components/notifications/PushStatusCard";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/notificacoes")({
  component: NotificacoesPage,
});

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];
type LoadState = "loading" | "ready" | "failed";

type NotificationTarget =
  | { kind: "ride-active"; rideId: string }
  | { kind: "ride-details"; rideId: string }
  | { kind: "wallet" }
  | { kind: "history" }
  | { kind: "home" }
  | { kind: "profile" };

function isRecord(value: Json): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readDataString(data: Json, key: string): string | null {
  if (!isRecord(data)) return null;
  const value = data[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolveTarget(notification: NotificationRow): NotificationTarget | null {
  const url = readDataString(notification.data, "url");
  const rideId = readDataString(notification.data, "ride_id");

  if (url === "/carteira") return { kind: "wallet" };
  if (url === "/corridas") return { kind: "history" };
  if (url === "/inicio") return { kind: "home" };
  if (url === "/perfil") return { kind: "profile" };

  const activeMatch = url?.match(/^\/corrida\/([0-9a-f-]{36})$/i);
  if (activeMatch?.[1]) return { kind: "ride-active", rideId: activeMatch[1] };

  const detailsMatch = url?.match(/^\/corridas\/([0-9a-f-]{36})$/i);
  if (detailsMatch?.[1]) return { kind: "ride-details", rideId: detailsMatch[1] };

  if (rideId) {
    const status = readDataString(notification.data, "status");
    const activeStatuses = new Set([
      "procurar_motorista",
      "motorista_a_caminho",
      "motorista_chegou",
      "em_viagem",
    ]);
    return activeStatuses.has(status ?? "")
      ? { kind: "ride-active", rideId }
      : { kind: "ride-details", rideId };
  }

  return null;
}

function formatNotificationDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function NotificacoesPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const identityIds = useMemo(
    () => [...new Set([profile?.id, user?.id].filter((value): value is string => Boolean(value)))],
    [profile?.id, user?.id],
  );
  const identityKey = identityIds.join(":");
  const requestSequence = useRef(0);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => notification.read_at === null).length,
    [notifications],
  );

  const loadNotifications = useCallback(
    async (background = false): Promise<void> => {
      const requestId = ++requestSequence.current;

      if (identityIds.length === 0) {
        setNotifications([]);
        setState("ready");
        setIsRefreshing(false);
        return;
      }

      if (background) setIsRefreshing(true);
      else setState("loading");

      const { data, error } = await supabase
        .from("notifications")
        .select("id, user_id, title, body, data, read_at, created_at")
        .in("user_id", identityIds)
        .order("created_at", { ascending: false })
        .limit(100);

      if (requestId !== requestSequence.current) return;

      if (error) {
        console.error("[Notifications] Failed to load notifications", {
          code: error.code,
          message: error.message,
        });
        setState("failed");
        setIsRefreshing(false);
        return;
      }

      setNotifications(data ?? []);
      setState("ready");
      setIsRefreshing(false);
    },
    [identityKey],
  );

  const markAsRead = useCallback(
    async (notificationId: string): Promise<void> => {
      if (identityIds.length === 0) return;

      const readAt = new Date().toISOString();
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === notificationId && notification.read_at === null
            ? { ...notification, read_at: readAt }
            : notification,
        ),
      );

      const { error } = await supabase
        .from("notifications")
        .update({ read_at: readAt })
        .eq("id", notificationId)
        .in("user_id", identityIds)
        .is("read_at", null);

      if (error) {
        console.error("[Notifications] Failed to mark notification as read", {
          code: error.code,
          message: error.message,
        });
        void loadNotifications(true);
      }
    },
    [identityKey, loadNotifications],
  );

  const markAllAsRead = useCallback(async (): Promise<void> => {
    if (identityIds.length === 0 || unreadCount === 0 || isMarkingAll) return;

    setIsMarkingAll(true);
    const readAt = new Date().toISOString();

    const { error } = await supabase
      .from("notifications")
      .update({ read_at: readAt })
      .in("user_id", identityIds)
      .is("read_at", null);

    if (error) {
      console.error("[Notifications] Failed to mark all notifications as read", {
        code: error.code,
        message: error.message,
      });
      setIsMarkingAll(false);
      return;
    }

    setNotifications((current) =>
      current.map((notification) => ({ ...notification, read_at: notification.read_at ?? readAt })),
    );
    setIsMarkingAll(false);
  }, [identityKey, isMarkingAll, unreadCount]);

  const openNotification = async (notification: NotificationRow): Promise<void> => {
    if (notification.read_at === null) await markAsRead(notification.id);
    const target = resolveTarget(notification);
    if (!target) return;

    switch (target.kind) {
      case "ride-active":
        await navigate({ to: "/corrida/$rideId", params: { rideId: target.rideId } });
        break;
      case "ride-details":
        await navigate({ to: "/corridas/$rideId", params: { rideId: target.rideId } });
        break;
      case "wallet":
        await navigate({ to: "/carteira" });
        break;
      case "history":
        await navigate({ to: "/corridas" });
        break;
      case "profile":
        await navigate({ to: "/perfil" });
        break;
      case "home":
        await navigate({ to: "/inicio" });
        break;
    }
  };

  useEffect(() => {
    void loadNotifications();

    if (identityIds.length === 0) return;

    let channel = supabase.channel(`passenger_notifications:${identityKey}`);
    identityIds.forEach((identityId) => {
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${identityId}`,
        },
        () => {
          void loadNotifications(true);
        },
      );
    });

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("[Notifications] Realtime unavailable", { status, identityIds });
      }
    });

    const handlePageShow = () => void loadNotifications(true);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      requestSequence.current += 1;
      window.removeEventListener("pageshow", handlePageShow);
      void supabase.removeChannel(channel);
    };
  }, [identityKey, loadNotifications]);

  return (
    <div className="app-screen min-h-[100dvh] min-w-0 bg-black text-white">
      <header className="sticky top-0 z-20 border-b border-white/8 bg-black/92 px-4 pb-4 pt-safe-area-inset-top backdrop-blur-xl sm:px-5">
        <div className="flex min-w-0 items-start justify-between gap-4 pt-5">
          <div className="min-w-0 flex-1">
            <p className="break-words text-[10px] font-black uppercase tracking-[0.18em] text-apois-yellow sm:tracking-[0.22em]">Central APOIS</p>
            <h1 className="mt-1 break-words text-2xl font-black tracking-[-0.04em]">Notificações</h1>
            <p className="mt-1 break-words text-sm text-zinc-500">
              {unreadCount > 0 ? `${unreadCount} não lida${unreadCount === 1 ? "" : "s"}` : "Tudo em dia"}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadNotifications(true)}
            disabled={isRefreshing}
            aria-label={isRefreshing ? "Atualizando notificações" : "Atualizar notificações"}
            aria-busy={isRefreshing}
            className="app-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900 disabled:opacity-50"
          >
            <RefreshCw size={18} aria-hidden="true" className={isRefreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      <main className="app-scroll min-w-0 px-4 pb-8 pt-5 sm:px-5">
        <PushStatusCard />

        {unreadCount > 0 && state === "ready" ? (
          <button
            type="button"
            onClick={() => void markAllAsRead()}
            disabled={isMarkingAll}
            aria-busy={isMarkingAll}
            className="app-pressable mb-4 mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-apois-yellow/20 bg-apois-yellow/10 px-4 py-2 text-center text-xs font-black leading-5 text-apois-yellow disabled:opacity-50"
          >
            {isMarkingAll ? <Loader2 size={16} className="shrink-0 animate-spin" aria-hidden="true" /> : <CheckCheck size={16} className="shrink-0" aria-hidden="true" />}
            Marcar todas como lidas
          </button>
        ) : null}

        {state === "loading" ? (
          <div className="flex min-h-[45vh] items-center justify-center" role="status" aria-label="Carregando notificações">
            <Loader2 className="animate-spin text-apois-yellow" size={32} aria-hidden="true" />
          </div>
        ) : null}

        {state === "failed" ? (
          <div className="flex min-h-[45vh] min-w-0 flex-col items-center justify-center gap-4 text-center" role="alert">
            <Bell size={40} className="text-zinc-700" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="break-words font-black">Não foi possível carregar</h2>
              <p className="mt-1 break-words text-sm leading-5 text-zinc-500">Verifique a conexão e tente novamente.</p>
            </div>
            <button type="button" onClick={() => void loadNotifications()} className="app-pressable min-h-11 rounded-xl bg-apois-yellow px-5 py-3 text-sm font-black text-black">Tentar novamente</button>
          </div>
        ) : null}

        {state === "ready" && notifications.length === 0 ? (
          <div className="flex min-h-[45vh] min-w-0 flex-col items-center justify-center gap-4 text-center" role="status">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-zinc-900" aria-hidden="true"><Bell size={34} className="text-zinc-600" /></div>
            <div className="min-w-0"><h2 className="break-words font-black">Nenhuma notificação</h2><p className="mt-1 break-words text-sm leading-5 text-zinc-500">Atualizações de corridas, pagamentos e segurança aparecerão aqui.</p></div>
          </div>
        ) : null}

        {state === "ready" && notifications.length > 0 ? (
          <div className="mt-4 min-w-0 space-y-3" aria-label="Lista de notificações">
            {notifications.map((notification) => {
              const unread = notification.read_at === null;
              const category = readDataString(notification.data, "category");
              const Icon = category === "wallet" ? WalletCards : category === "ride_update" ? Car : Bell;
              const target = resolveTarget(notification);

              return (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => void openNotification(notification)}
                  aria-label={`${unread ? "Não lida. " : ""}${notification.title}${target ? ". Abrir detalhes" : ""}`}
                  className={`app-pressable w-full min-w-0 rounded-3xl border p-4 text-left transition-colors ${unread ? "border-apois-yellow/25 bg-apois-yellow/10" : "border-white/8 bg-zinc-950"}`}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${unread ? "bg-apois-yellow text-black" : "bg-zinc-900 text-zinc-500"}`} aria-hidden="true"><Icon size={19} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
                        <h2 className="min-w-[150px] flex-1 break-words text-sm font-black leading-5 text-white">{notification.title}</h2>
                        <time className="break-words text-[10px] font-bold leading-4 text-zinc-600">{formatNotificationDate(notification.created_at)}</time>
                      </div>
                      {notification.body ? <p className="mt-1 break-words text-xs leading-5 text-zinc-400">{notification.body}</p> : null}
                      {target ? <p className="mt-3 flex min-h-6 items-center gap-1 break-words text-[10px] font-black uppercase tracking-[0.12em] text-apois-yellow">Abrir detalhes<ChevronRight size={13} className="shrink-0" aria-hidden="true" /></p> : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}
      </main>
    </div>
  );
}
