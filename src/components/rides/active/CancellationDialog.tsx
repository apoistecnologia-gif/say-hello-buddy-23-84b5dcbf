import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCancellationPolicy } from "@/hooks/rides/use-cancellation-policy";
import { useRideRequest } from "@/hooks/rides/use-ride-request";
import { formatCurrency } from "@/lib/utils";
import type { RideRequestResponse } from "@/types/rides/ride-request";

interface CancellationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  rideId: string;
  rideCreatedAt?: string;
  onSuccess: (response: RideRequestResponse) => void;
}

const cancellationReasons = [
  "Não preciso mais da corrida",
  "Tempo de espera muito alto",
  "Motorista não está se aproximando",
  "Escolhi origem ou destino errado",
  "Solicitei por engano",
  "Outro motivo",
] as const;

const formatRemainingTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes <= 0) return `${remainingSeconds}s`;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};

export const CancellationDialog: React.FC<CancellationDialogProps> = ({
  isOpen,
  onClose,
  rideId,
  rideCreatedAt,
  onSuccess,
}) => {
  const { cancelRide } = useRideRequest();
  const { policy, isLoading: isPolicyLoading, error: policyError, refresh } = useCancellationPolicy();
  const [selectedReason, setSelectedReason] = useState<string>("");
  const [customReason, setCustomReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isOpen) {
      setSelectedReason("");
      setCustomReason("");
      setIsCancelling(false);
      setError(null);
      return;
    }
    setNow(Date.now());
    const intervalId = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(intervalId);
  }, [isOpen]);

  const elapsedSeconds = useMemo(() => {
    const createdAt = Date.parse(rideCreatedAt ?? "");
    if (!Number.isFinite(createdAt)) return 0;
    return Math.max(0, Math.floor((now - createdAt) / 1_000));
  }, [now, rideCreatedAt]);

  const freeSecondsRemaining = Math.max(0, policy.freeSeconds - elapsedSeconds);
  const feeWouldApply = policy.enabled && policy.amount > 0 && freeSecondsRemaining === 0;
  const reason = selectedReason === "Outro motivo" ? customReason.trim() : selectedReason.trim();

  const handleCancel = async (): Promise<void> => {
    if (isCancelling || isPolicyLoading || policyError) return;
    if (!reason) { setError("Escolha o motivo do cancelamento."); return; }
    setIsCancelling(true);
    setError(null);
    try {
      const response = await cancelRide(rideId, reason);
      if (response.fee_applied && response.fee_applied > 0) toast.warning(`Corrida cancelada. Foi aplicada uma multa de ${formatCurrency(response.fee_applied)}.`);
      else toast.success("Corrida cancelada sem multa.");
      onSuccess(response);
    } catch (caughtError: unknown) {
      setError(caughtError instanceof Error && caughtError.message ? caughtError.message : "Não foi possível cancelar a corrida.");
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isCancelling) onClose(); }}>
      <DialogContent className="app-dialog-content max-h-[88dvh] w-[calc(100vw-24px)] max-w-md overflow-y-auto rounded-3xl border-white/10 bg-zinc-950 p-4 text-white sm:w-[calc(100vw-32px)] sm:p-6" aria-busy={isCancelling}>
        <DialogHeader>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10" aria-hidden="true"><XCircle className="text-red-500" size={24} /></div>
          <DialogTitle className="break-words text-xl font-black">Cancelar corrida?</DialogTitle>
          <DialogDescription className="break-words text-sm font-medium leading-6 text-zinc-400">Informe o motivo e confira a regra vigente antes de confirmar.</DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4 py-4">
          <section className="min-w-0 rounded-2xl border border-white/8 bg-zinc-900/70 p-4">
            {isPolicyLoading ? (
              <div className="flex min-w-0 items-center gap-3 text-sm text-zinc-400" role="status" aria-live="polite"><Loader2 className="shrink-0 animate-spin text-apois-yellow" size={18} aria-hidden="true" /><span className="break-words">Carregando regra de cancelamento...</span></div>
            ) : policyError ? (
              <div role="alert"><div className="flex min-w-0 items-start gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-red-400" size={18} aria-hidden="true" /><p className="min-w-0 flex-1 break-words text-xs leading-5 text-red-300">A regra não pôde ser carregada. O cancelamento está bloqueado para evitar cobrança sem aviso.</p></div><button type="button" onClick={() => void refresh()} className="app-pressable mt-3 min-h-11 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-center text-xs font-black leading-5 text-white">Carregar novamente</button></div>
            ) : feeWouldApply ? (
              <div className="flex min-w-0 items-start gap-3" role="status"><AlertTriangle className="mt-0.5 shrink-0 text-apois-yellow" size={18} aria-hidden="true" /><div className="min-w-0"><p className="max-w-full break-words text-sm font-black tabular-nums text-white">Multa atual: {formatCurrency(policy.amount)}</p><p className="mt-1 break-words text-xs leading-5 text-zinc-400">O período gratuito de cancelamento já terminou. O valor será registrado na sua carteira ao confirmar.</p></div></div>
            ) : (
              <div className="flex min-w-0 items-start gap-3" role="status"><Check className="mt-0.5 shrink-0 text-apois-success" size={18} aria-hidden="true" /><div className="min-w-0"><p className="break-words text-sm font-black text-white">Cancelamento sem multa</p><p className="mt-1 break-words text-xs leading-5 text-zinc-400">{policy.enabled && policy.amount > 0 ? `Restam aproximadamente ${formatRemainingTime(freeSecondsRemaining)} do período gratuito.` : "A cobrança de multa está desativada no momento."}</p></div></div>
            )}
          </section>

          <fieldset className="min-w-0">
            <legend className="mb-2 break-words text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Motivo do cancelamento</legend>
            <div className="space-y-2">
              {cancellationReasons.map((item) => {
                const selected = selectedReason === item;
                return (
                  <button key={item} type="button" aria-pressed={selected} onClick={() => { setSelectedReason(item); setError(null); }} className={`app-pressable flex min-h-12 w-full min-w-0 items-center justify-between gap-3 rounded-xl border px-4 py-2 text-left text-xs font-bold leading-5 ${selected ? "border-apois-yellow/50 bg-apois-yellow/10 text-white" : "border-white/8 bg-white/[0.03] text-zinc-400"}`}>
                    <span className="min-w-0 flex-1 break-words">{item}</span><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? "border-apois-yellow bg-apois-yellow text-black" : "border-zinc-700"}`} aria-hidden="true">{selected ? <Check size={12} strokeWidth={3} /> : null}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {selectedReason === "Outro motivo" ? <label className="block min-w-0"><span className="mb-2 block break-words text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Descreva o motivo</span><textarea value={customReason} onChange={(event) => setCustomReason(event.target.value.slice(0, 300))} rows={3} maxLength={300} placeholder="Explique brevemente o motivo do cancelamento." className="w-full min-w-0 max-w-full resize-none rounded-2xl border border-white/10 bg-black/40 p-4 text-base text-white outline-none placeholder:text-zinc-600 focus:border-apois-yellow" /><span className="mt-1 block text-right text-[10px] text-zinc-600">{customReason.length}/300</span></label> : null}

          {error ? <p role="alert" aria-live="assertive" className="break-words rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs font-bold leading-5 text-red-300">{error}</p> : null}
        </div>

        <DialogFooter className="mt-2 flex flex-col gap-2">
          <button type="button" onClick={() => void handleCancel()} disabled={isCancelling || isPolicyLoading || Boolean(policyError) || !reason} aria-busy={isCancelling} className="app-pressable flex min-h-12 w-full items-center justify-center rounded-2xl bg-red-600 px-4 py-2 text-center text-sm font-black leading-5 text-white disabled:bg-zinc-800 disabled:text-zinc-500">{isCancelling ? <Loader2 className="mr-2 shrink-0 animate-spin" size={18} aria-hidden="true" /> : null}<span className="break-words">{feeWouldApply ? `Cancelar e aceitar multa de ${formatCurrency(policy.amount)}` : "Confirmar cancelamento"}</span></button>
          <button type="button" className="app-pressable min-h-12 w-full rounded-2xl px-4 py-2 text-sm font-black text-zinc-400" onClick={onClose} disabled={isCancelling}>Manter corrida</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
