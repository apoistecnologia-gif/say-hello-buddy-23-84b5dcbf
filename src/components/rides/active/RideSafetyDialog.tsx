import { useMemo, useState } from "react";
import { Ambulance, Car, Phone, Share2, ShieldAlert, Siren, Unlink, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActiveRide } from "@/hooks/rides/use-active-ride";
import { passengerSafetyService } from "@/services/safety/passenger-safety-service";
import { passengerShareService } from "@/services/safety/passenger-share-service";

interface RideSafetyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverName?: string | undefined;
  driverPhone?: string | undefined;
  onShareRide: () => void | Promise<void>;
}

function callPhone(number: string): void {
  const normalized = number.replace(/[^\d+]/g, "");
  if (!normalized) return;
  window.location.href = `tel:${normalized}`;
}

export function RideSafetyDialog({
  open,
  onOpenChange,
  driverName,
  driverPhone,
  onShareRide,
}: RideSafetyDialogProps) {
  const { ride, refreshRide } = useActiveRide();
  const [isSendingSos, setIsSendingSos] = useState(false);
  const [isRevokingShare, setIsRevokingShare] = useState(false);

  const hasActiveShare = useMemo(() => {
    if (!ride?.share_token || ride.share_revoked_at) return false;
    if (!ride.share_expires_at) return true;
    const expiresAt = Date.parse(ride.share_expires_at);
    return Number.isFinite(expiresAt) && expiresAt > Date.now();
  }, [ride?.share_expires_at, ride?.share_revoked_at, ride?.share_token]);

  const triggerSos = async (): Promise<void> => {
    if (!ride || isSendingSos) return;
    setIsSendingSos(true);
    try {
      await passengerSafetyService.triggerSos(ride.id, "critical");
      toast.success("SOS registrado na Central APOIS.", {
        description: "Em perigo imediato, acione também a Polícia pelo 190.",
        duration: 8000,
      });
    } catch (caughtError: unknown) {
      toast.error(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível registrar o SOS na Central APOIS.",
      );
    } finally {
      setIsSendingSos(false);
    }
  };

  const revokeShare = async (): Promise<void> => {
    if (!ride || !hasActiveShare || isRevokingShare) return;
    setIsRevokingShare(true);
    try {
      await passengerShareService.revoke(ride.id);
      await refreshRide();
      toast.success("Compartilhamento encerrado.", {
        description: "O link anterior não pode mais acompanhar esta corrida.",
      });
    } catch (caughtError: unknown) {
      toast.error(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível encerrar o compartilhamento.",
      );
    } finally {
      setIsRevokingShare(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-32px)] max-w-md overflow-y-auto rounded-[30px] border-red-500/20 bg-zinc-950 p-0 text-white">
        <DialogHeader className="border-b border-white/8 p-5 text-left">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-500/15 text-red-400">
                <ShieldAlert size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">
                  Proteção durante a viagem
                </p>
                <DialogTitle className="mt-1 text-xl font-black">Central de segurança</DialogTitle>
              </div>
            </div>
            <button
              type="button"
              aria-label="Fechar central de segurança"
              onClick={() => onOpenChange(false)}
              className="app-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-900"
            >
              <X size={18} />
            </button>
          </div>
        </DialogHeader>

        <div className="space-y-3 p-5">
          <p className="rounded-2xl border border-red-500/15 bg-red-500/8 p-4 text-xs leading-5 text-red-100/80">
            Em risco imediato, procure um local seguro e acione o serviço público adequado. A APOIS não substitui os serviços de emergência.
          </p>

          <SafetyAction
            icon={ShieldAlert}
            title={isSendingSos ? "Registrando SOS..." : "SOS APOIS — acionar central"}
            description="Registra esta corrida e sua localização atual como alerta operacional de segurança."
            tone="danger"
            disabled={!ride || isSendingSos}
            onClick={() => void triggerSos()}
          />

          <SafetyAction
            icon={Siren}
            title="Polícia — 190"
            description="Para ameaça, violência, roubo ou perigo imediato."
            tone="danger"
            onClick={() => callPhone("190")}
          />

          <SafetyAction
            icon={Ambulance}
            title="SAMU — 192"
            description="Para emergência médica com necessidade de atendimento urgente."
            tone="danger"
            onClick={() => callPhone("192")}
          />

          <SafetyAction
            icon={Share2}
            title="Compartilhar acompanhamento"
            description="Crie e envie um link protegido e temporário desta corrida para alguém de confiança."
            onClick={() => void onShareRide()}
          />

          {hasActiveShare ? (
            <SafetyAction
              icon={Unlink}
              title={isRevokingShare ? "Encerrando compartilhamento..." : "Encerrar compartilhamento"}
              description="Revoga imediatamente o link de acompanhamento que está ativo."
              disabled={isRevokingShare}
              onClick={() => void revokeShare()}
            />
          ) : null}

          {driverPhone ? (
            <SafetyAction
              icon={Car}
              title={`Ligar para ${driverName?.trim() || "o motorista"}`}
              description="Use para combinar o ponto de encontro ou avisar sobre uma situação."
              onClick={() => callPhone(driverPhone)}
            />
          ) : null}

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="app-pressable mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 text-sm font-black text-zinc-300"
          >
            <Phone size={17} />
            Voltar para a corrida
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SafetyAction({
  icon: Icon,
  title,
  description,
  onClick,
  tone = "neutral",
  disabled = false,
}: {
  icon: typeof Siren;
  title: string;
  description: string;
  onClick: () => void;
  tone?: "neutral" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`app-pressable flex min-h-20 w-full items-center gap-4 rounded-2xl border p-4 text-left disabled:cursor-not-allowed disabled:opacity-60 ${
        tone === "danger"
          ? "border-red-500/20 bg-red-500/8"
          : "border-white/8 bg-white/[0.03]"
      }`}
    >
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
          tone === "danger" ? "bg-red-500/15 text-red-400" : "bg-zinc-900 text-apois-yellow"
        }`}
      >
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-black text-white">{title}</p>
        <p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p>
      </div>
    </button>
  );
}
