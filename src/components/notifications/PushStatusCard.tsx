import { useState } from "react";
import { Bell, BellOff, Loader2, RefreshCw, Smartphone } from "lucide-react";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { initializePush } from "@/services/push/push-service";

export function PushStatusCard() {
  const { status, lastError } = usePushNotifications();
  const [isRetrying, setIsRetrying] = useState(false);

  if (status === "idle" || status === "prompt") return null;

  const canRetry = status === "denied" || status === "error";
  const content =
    status === "granted"
      ? {
          icon: <Bell size={16} className="text-apois-yellow" />,
          text: "Notificações ativas neste dispositivo.",
        }
      : status === "denied"
        ? {
            icon: <BellOff size={16} className="text-zinc-400" />,
            text: "Notificações desativadas. Ative nas configurações do celular e depois verifique novamente.",
          }
        : status === "error"
          ? {
              icon: <BellOff size={16} className="text-zinc-400" />,
              text: lastError || "Não foi possível ativar as notificações neste dispositivo.",
            }
          : {
              icon: <Smartphone size={16} className="text-zinc-400" />,
              text: "Avisos em tempo real ficam disponíveis no aplicativo instalado no celular.",
            };

  const retry = async (): Promise<void> => {
    if (isRetrying) return;
    setIsRetrying(true);
    try {
      await initializePush();
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className="mb-4 rounded-2xl border border-white/10 bg-zinc-900/70 px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5">{content.icon}</span>
        <p className="flex-1 text-xs leading-relaxed text-zinc-400">{content.text}</p>
      </div>

      {canRetry ? (
        <button
          type="button"
          onClick={() => void retry()}
          disabled={isRetrying}
          className="app-pressable mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/30 px-4 text-xs font-black text-white disabled:opacity-50"
        >
          {isRetrying ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <RefreshCw size={15} />
          )}
          {isRetrying ? "Verificando..." : "Verificar novamente"}
        </button>
      ) : null}
    </div>
  );
}
