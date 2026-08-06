import { Bell, BellOff, Smartphone } from "lucide-react";
import { usePushNotifications } from "@/hooks/use-push-notifications";

/** Aviso discreto sobre o estado das notificações do dispositivo. */
export function PushStatusCard() {
  const { status } = usePushNotifications();

  if (status === "idle" || status === "prompt") return null;

  const content =
    status === "granted"
      ? {
          icon: <Bell size={16} className="text-apois-yellow" />,
          text: "Notificações ativas neste dispositivo.",
        }
      : status === "denied"
        ? {
            icon: <BellOff size={16} className="text-zinc-400" />,
            text: "Notificações desativadas. Ative nas configurações do seu celular para acompanhar a corrida.",
          }
        : {
            icon: <Smartphone size={16} className="text-zinc-400" />,
            text: "Avisos em tempo real ficam disponíveis no aplicativo instalado no celular.",
          };

  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl border border-white/10 bg-zinc-900/70 px-4 py-3">
      <span className="mt-0.5">{content.icon}</span>
      <p className="text-xs leading-relaxed text-zinc-400">{content.text}</p>
    </div>
  );
}
