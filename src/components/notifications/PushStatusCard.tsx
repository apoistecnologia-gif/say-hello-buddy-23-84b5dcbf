import { useState } from "react";
import { Bell, BellOff, Loader2, RefreshCw, Smartphone } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { initializePush } from "@/services/push/push-service";

export function PushStatusCard() {
  const { user } = useAuth();
  const { status } = usePushNotifications();
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);

  if (status === "idle" || status === "prompt") return null;

  const canRetry = status === "denied" || status === "error";
  const content =
    status === "granted"
      ? {
          icon: <Bell size={18} className="text-apois-yellow" aria-hidden="true" />,
          title: "Notificações ativas",
          text: "Este aparelho está pronto para receber atualizações da corrida.",
        }
      : status === "denied"
        ? {
            icon: <BellOff size={18} className="text-zinc-400" aria-hidden="true" />,
            title: "Notificações desativadas",
            text: "Ative as notificações nas configurações do celular e depois verifique novamente.",
          }
        : status === "error"
          ? {
              icon: <BellOff size={18} className="text-zinc-400" aria-hidden="true" />,
              title: "Não foi possível ativar as notificações",
              text: "Verifique a conexão e tente novamente.",
            }
          : {
              icon: <Smartphone size={18} className="text-zinc-400" aria-hidden="true" />,
              title: "Notificações no aplicativo",
              text: "Avisos em tempo real ficam disponíveis no aplicativo instalado no celular.",
            };

  const retry = async (): Promise<void> => {
    if (isRetrying || !user?.id) return;
    setRetryFailed(false);
    setIsRetrying(true);
    try {
      await initializePush(user.id);
    } catch (error) {
      console.error("[APOIS Push] retry failed", error);
      setRetryFailed(true);
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <section
      className="mb-4 min-w-0 rounded-2xl border border-white/10 bg-zinc-900/70 px-4 py-3.5"
      role={status === "error" || status === "denied" || retryFailed ? "alert" : "status"}
      aria-live={status === "error" || status === "denied" || retryFailed ? "assertive" : "polite"}
      aria-busy={isRetrying}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black/25">{content.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-xs font-black leading-5 text-zinc-200">{content.title}</p>
          <p className="mt-0.5 break-words text-xs leading-5 text-zinc-400 [overflow-wrap:anywhere]">{content.text}</p>
        </div>
      </div>

      {retryFailed ? (
        <p className="mt-3 break-words rounded-xl border border-red-500/15 bg-red-500/5 px-3 py-2 text-xs font-medium leading-5 text-red-300">
          A verificação não foi concluída. Tente novamente em instantes.
        </p>
      ) : null}

      {canRetry ? (
        <button
          type="button"
          onClick={() => void retry()}
          disabled={isRetrying || !user?.id}
          aria-busy={isRetrying}
          className="app-pressable mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-center text-xs font-black leading-5 text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apois-yellow disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
        >
          {isRetrying ? (
            <Loader2 size={16} className="shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <RefreshCw size={16} className="shrink-0" aria-hidden="true" />
          )}
          <span className="break-words">{isRetrying ? "Verificando..." : "Verificar novamente"}</span>
        </button>
      ) : null}
    </section>
  );
}
