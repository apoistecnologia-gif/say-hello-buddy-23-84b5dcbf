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

export function RideSafetyDialog({ open, onOpenChange, driverName, driverPhone, onShareRide }: RideSafetyDialogProps) {
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
      toast.success("SOS registrado na Central APOIS.", { description: "Em perigo imediato, acione também a Polícia pelo 190.", duration: 8000 });
    } catch (caughtError: unknown) {
      toast.error(caughtError instanceof Error ? caughtError.message : "Não foi possível registrar o SOS na Central APOIS.");
    } finally { setIsSendingSos(false); }
  };

  const revokeShare = async (): Promise<void> => {
    if (!ride || !hasActiveShare || isRevokingShare) return;
    setIsRevokingShare(true);
    try {
      await passengerShareService.revoke(ride.id);
      await refreshRide();
      toast.success("Compartilhamento encerrado.", { description: "O link anterior não pode mais acompanhar esta corrida." });
    } catch (caughtError: unknown) {
      toast.error(caughtError instanceof Error ? caughtError.message : "Não foi possível encerrar o compartilhamento.");
    } finally { setIsRevokingShare(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="app-dialog-content max-h-[92dvh] w-[calc(100vw-24px)] max-w-md overflow-y-auto rounded-[30px] border-red-500/20 bg-zinc-950 p-0 text-white sm:w-[calc(100vw-32px)]" aria-busy={isSendingSos || isRevokingShare}>
        <DialogHeader className="border-b border-white/8 p-4 text-left sm:p-5">
          <div className="flex min-w-0 items-start justify-between gap-3 sm:gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-500/15 text-red-400" aria-hidden="true"><ShieldAlert size={24} /></div>
              <div className="min-w-0 flex-1"><p className="break-words text-[10px] font-black uppercase tracking-[0.16em] text-red-400 sm:tracking-[0.18em]">Proteção durante a viagem</p><DialogTitle className="mt-1 break-words text-xl font-black leading-6">Central de segurança</DialogTitle></div>
            </div>
            <button type="button" aria-label="Fechar central de segurança" onClick={() => onOpenChange(false)} disabled={isSendingSos || isRevokingShare} className="app-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-900 disabled:opacity-50"><X size={18} aria-hidden="true" /></button>
          </div>
        </DialogHeader>

        <div className="min-w-0 space-y-3 p-4 sm:p-5">
          <p className="break-words rounded-2xl border border-red-500/15 bg-red-500/8 p-4 text-xs leading-5 text-red-100/80">Em risco imediato, procure um local seguro e acione o serviço público adequado. A APOIS não substitui os serviços de emergência.</p>

          <SafetyAction icon={ShieldAlert} title={isSendingSos ? "Registrando SOS..." : "SOS APOIS — acionar central"} description="Registra esta corrida e sua localização atual como alerta operacional de segurança." tone="danger" disabled={!ride || isSendingSos} busy={isSendingSos} onClick={() => void triggerSos()} />
          <SafetyAction icon={Siren} title="Polícia — 190" description="Para ameaça, violência, roubo ou perigo imediato." tone="danger" onClick={() => callPhone("190")} />
          <SafetyAction icon={Ambulance} title="SAMU — 192" description="Para emergência médica com necessidade de atendimento urgente." tone="danger" onClick={() => callPhone("192")} />
          <SafetyAction icon={Share2} title="Compartilhar acompanhamento" description="Crie e envie um link protegido e temporário desta corrida para alguém de confiança." onClick={() => void onShareRide()} />
          {hasActiveShare ? <SafetyAction icon={Unlink} title={isRevokingShare ? "Encerrando compartilhamento..." : "Encerrar compartilhamento"} description="Revoga imediatamente o link de acompanhamento que está ativo." disabled={isRevokingShare} busy={isRevokingShare} onClick={() => void revokeShare()} /> : null}
          {driverPhone ? <SafetyAction icon={Car} title={`Ligar para ${driverName?.trim() || "o motorista"}`} description="Use para combinar o ponto de encontro ou avisar sobre uma situação." onClick={() => callPhone(driverPhone)} /> : null}

          <button type="button" onClick={() => onOpenChange(false)} className="app-pressable mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-center text-sm font-black leading-5 text-zinc-300"><Phone size={17} className="shrink-0" aria-hidden="true" />Voltar para a corrida</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SafetyAction({ icon: Icon, title, description, onClick, tone = "neutral", disabled = false, busy = false }: { icon: typeof Siren; title: string; description: string; onClick: () => void; tone?: "neutral" | "danger"; disabled?: boolean; busy?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-busy={busy} className={`app-pressable flex min-h-20 w-full min-w-0 items-center gap-3 rounded-2xl border p-3 text-left disabled:cursor-not-allowed disabled:opacity-60 sm:gap-4 sm:p-4 ${tone === "danger" ? "border-red-500/20 bg-red-500/8" : "border-white/8 bg-white/[0.03]"}`}>
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tone === "danger" ? "bg-red-500/15 text-red-400" : "bg-zinc-900 text-apois-yellow"}`} aria-hidden="true"><Icon size={20} /></div>
      <div className="min-w-0 flex-1"><p className="break-words text-sm font-black leading-5 text-white">{title}</p><p className="mt-1 break-words text-xs leading-5 text-zinc-500">{description}</p></div>
    </button>
  );
}
