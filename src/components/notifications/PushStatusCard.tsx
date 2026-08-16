import { useState } from "react";
import { Bell, BellOff, Loader2, RefreshCw, Smartphone } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { initializePush } from "@/services/push/push-service";

export function PushStatusCard() {
  const { user } = useAuth();
  const { status, lastError } = usePushNotifications();
  const [isRetrying, setIsRetrying] = useState(false);

  if (status === "idle" || status === "prompt") return null;

  const canRetry = status === "denied" || status === "error";
  const content =
    status === "granted"
      ? {
          icon: <Bell size={16} className="text-apois-yellow" aria-hidden="true" />,
          text: "Notificações ativas neste dispositivo.",
        }
      : status === "denied"
        ? {
            icon: <BellOff size={16} className="text-zinc-400" aria-hidden="true" />,
            text: "Notificações desativadas. Ative nas configurações do celular e depois verifique novamente.",
          }
        : status === "error"
          ? {
              icon: <BellOff size={16} className="text-zinc-400" aria-hidden="true" />,
              text: lastError || "Não foi possível ativar as notificações neste dispositivo.",
            }
          : {
              icon: <Smartphone size={16} className="text-zinc-400" aria-hidden="true" />,
              text: "Avisos em tempo real ficam disponíveis no aplicativo instalado no celular.",
            };

  const retry = async (): Promise<void> => {
    if (isRetrying || !user?.id) return;
    setIsRetrying(true);
    try {
      await initializePush(user.id);
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <section
      className="mb-4 min-w-0 rounded-2xl border border-white/10 bg-zinc-900/70 px-4 py-3"
      role={status === "error" || status === "denied" ? "alert" : "status"}
      aria-live="polite"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 shrink-0">{content.icon}</span>
        <p className="min-w-0 flex-1 break-words text-xs leading-5 text-zinc-400">{content.text}</p>
      </div>

      {canRetry ? (
        <button
          type="button"
          onClick={() => void retry()}
          disabled={isRetrying || !user?.id}
          aria-busy={isRetrying}
          className="app-pressable mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-center text-xs font-black leading-5 text-white disabled:opacity-50"
        >
          {isRetrying ? (
            <Loader2 size={15} className="shrink-0 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw size={15} className="shrink-0" aria-hidden="true" />
          )}
          {isRetrying ? "Verificando..." : "Verificar novamente"}
        </button>
      ) : null}
    </section>
  );
}
