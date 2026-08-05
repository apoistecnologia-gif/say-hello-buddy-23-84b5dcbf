import { createFileRoute } from "@tanstack/react-router";
import { Bell, CheckCheck, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/notificacoes")({
  component: NotificacoesPage,
});

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

type LoadState = "loading" | "ready" | "failed";

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
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const requestSequence = useRef(0);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => notification.read_at === null).length,
    [notifications],
  );

  const loadNotifications = useCallback(async (background = false): Promise<void> => {
    const requestId = ++requestSequence.current;

    if (!userId) {
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
      .eq("user_id", userId)
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
  }, [userId]);

  const markAsRead = useCallback(async (notificationId: string): Promise<void> => {
    if (!userId) return;

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
      .eq("user_id", userId)
      .is("read_at", null);

    if (error) {
      console.error("[Notifications] Failed to mark notification as read", {
        code: error.code,
        message: error.message,
      });
      void loadNotifications(true);
    }
  }, [loadNotifications, userId]);

  const markAllAsRead = useCallback(async (): Promise<void> => {
    if (!userId || unreadCount === 0 || isMarkingAll) return;

    setIsMarkingAll(true);
    const readAt = new Date().toISOString();

    const { error } = await supabase
      .from("notifications")
      .update({ read_at: readAt })
      .eq("user_id", userId)
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
  }, [isMarkingAll, unreadCount, userId]);

  useEffect(() => {
    void loadNotifications();

    if (!userId) return;

    const channel = supabase
      .channel(`passenger_notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadNotifications(true);
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[Notifications] Realtime unavailable", { status, userId });
        }
      });

    return () => {
      requestSequence.current += 1;
      void supabase.removeChannel(channel);
    };
  }, [loadNotifications, userId]);

  return (
    <div className="min-h-screen bg-black px-5 pb-24 pt-8 text-white">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-apois-yellow">
            Central APOIS
          </p>
          <h1 className="mt-1 text-2xl font-black">Notificações</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {unreadCount > 0 ? `${unreadCount} não lida${unreadCount === 1 ? "" : "s"}` : "Tudo em dia"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadNotifications(true)}
          disabled={isRefreshing}
          aria-label="Atualizar notificações"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-zinc-900 disabled:opacity-50"
        >
          <RefreshCw size={18} className={isRefreshing ? "animate-spin" : ""} />
        </button>
      </header>

      {unreadCount > 0 && state === "ready" && (
        <button
          type="button"
          onClick={() => void markAllAsRead()}
          disabled={isMarkingAll}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-apois-yellow/20 bg-apois-yellow/10 px-4 py-3 text-xs font-black text-apois-yellow disabled:opacity-50"
        >
          {isMarkingAll ? <Loader2 size={16} className="animate-spin" /> : <CheckCheck size={16} />}
          Marcar todas como lidas
        </button>
      )}

      {state === "loading" && (
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="animate-spin text-apois-yellow" size={32} />
        </div>
      )}

      {state === "failed" && (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
          <Bell size={40} className="text-zinc-700" />
          <div>
            <h2 className="font-black">Não foi possível carregar</h2>
            <p className="mt-1 text-sm text-zinc-500">Verifique a conexão e tente novamente.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadNotifications()}
            className="rounded-xl bg-apois-yellow px-5 py-3 text-sm font-black text-black"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {state === "ready" && notifications.length === 0 && (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-zinc-900">
            <Bell size={34} className="text-zinc-600" />
          </div>
          <div>
            <h2 className="font-black">Nenhuma notificação</h2>
            <p className="mt-1 text-sm text-zinc-500">As novidades da sua conta aparecerão aqui.</p>
          </div>
        </div>
      )}

      {state === "ready" && notifications.length > 0 && (
        <div className="space-y-3">
          {notifications.map((notification) => {
            const unread = notification.read_at === null;

            return (
              <button
                key={notification.id}
                type="button"
                onClick={() => {
                  if (unread) void markAsRead(notification.id);
                }}
                className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                  unread
                    ? "border-apois-yellow/20 bg-apois-yellow/10"
                    : "border-white/5 bg-zinc-950"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                      unread ? "bg-apois-yellow" : "bg-zinc-700"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-sm font-black text-white">{notification.title}</h2>
                      <time className="shrink-0 text-[10px] font-bold text-zinc-600">
                        {formatNotificationDate(notification.created_at)}
                      </time>
                    </div>
                    {notification.body && (
                      <p className="mt-1 text-xs leading-relaxed text-zinc-400">{notification.body}</p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
