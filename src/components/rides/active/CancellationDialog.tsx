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
import { useActiveRide } from "@/hooks/rides/use-active-ride";
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
  const { ride: activeRide } = useActiveRide();
  const { policy, isLoading: isPolicyLoading, error: policyError, refresh } =
    useCancellationPolicy();
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

  const matchingRide = activeRide?.id === rideId ? activeRide : null;
  const feeEligibleStage = matchingRide?.status === "motorista_a_caminho";
  const feeReferenceAt = feeEligibleStage
    ? matchingRide?.accepted_at ?? rideCreatedAt
    : null;

  const elapsedSeconds = useMemo(() => {
    const referenceAt = Date.parse(feeReferenceAt ?? "");
    if (!Number.isFinite(referenceAt)) return 0;
    return Math.max(0, Math.floor((now - referenceAt) / 1_000));
  }, [feeReferenceAt, now]);

  const freeSecondsRemaining = feeEligibleStage
    ? Math.max(0, policy.freeSeconds - elapsedSeconds)
    : policy.freeSeconds;
  const feeWouldApply =
    feeEligibleStage && policy.enabled && policy.amount > 0 && freeSecondsRemaining === 0;

  const reason =
    selectedReason === "Outro motivo" ? customReason.trim() : selectedReason.trim();

  const handleCancel = async (): Promise<void> => {
    if (isCancelling || isPolicyLoading || policyError) return;
    if (!reason) {
      setError("Escolha o motivo do cancelamento.");
      return;
    }

    setIsCancelling(true);
    setError(null);

    try {
      const response = await cancelRide(rideId, reason);
      if (response.fee_applied && response.fee_applied > 0) {
        toast.warning(
          `Corrida cancelada. Foi aplicada uma multa de ${formatCurrency(response.fee_applied)}.`,
        );
      } else {
        toast.success("Corrida cancelada sem multa.");
      }
      onSuccess(response);
    } catch (caughtError: unknown) {
      const message =
        caughtError instanceof Error && caughtError.message
          ? caughtError.message
          : "Não foi possível cancelar a corrida.";
      setError(message);
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isCancelling) onClose();
      }}
    >
      <DialogContent className="max-h-[88dvh] w-[calc(100vw-32px)] max-w-md overflow-y-auto rounded-3xl border-white/10 bg-zinc-950 p-6 text-white">
        <DialogHeader>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
            <XCircle className="text-red-500" size={24} />
          </div>
          <DialogTitle className="text-xl font-black">Cancelar corrida?</DialogTitle>
          <DialogDescription className="text-sm font-medium leading-6 text-zinc-400">
            Informe o motivo e confira a regra vigente antes de confirmar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <section className="rounded-2xl border border-white/8 bg-zinc-900/70 p-4">
            {isPolicyLoading ? (
              <div className="flex items-center gap-3 text-sm text-zinc-400">
                <Loader2 className="animate-spin text-apois-yellow" size={18} />
                Carregando regra de cancelamento...
              </div>
            ) : policyError ? (
              <div>
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 shrink-0 text-red-400" size={18} />
                  <p className="text-xs leading-5 text-red-300">
                    A regra não pôde ser carregada. O cancelamento está bloqueado para evitar cobrança sem aviso.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="app-pressable mt-3 min-h-10 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-xs font-black text-white"
                >
                  Carregar novamente
                </button>
              </div>
            ) : feeWouldApply ? (
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 shrink-0 text-apois-yellow" size={18} />
                <div>
                  <p className="text-sm font-black text-white">
                    Multa atual: {formatCurrency(policy.amount)}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-zinc-400">
                    O período gratuito após o aceite do motorista já terminou. O valor será registrado na sua carteira ao confirmar.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <Check className="mt-0.5 shrink-0 text-apois-success" size={18} />
                <div>
                  <p className="text-sm font-black text-white">Cancelamento sem multa</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-400">
                    {!feeEligibleStage
                      ? "Nenhuma multa é aplicada nesta etapa da solicitação."
                      : policy.enabled && policy.amount > 0
                        ? `Restam aproximadamente ${formatRemainingTime(freeSecondsRemaining)} do período gratuito após o aceite do motorista.`
                        : "A cobrança de multa está desativada no momento."}
                  </p>
                </div>
              </div>
            )}
          </section>

          <fieldset>
            <legend className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
              Motivo do cancelamento
            </legend>
            <div className="space-y-2">
              {cancellationReasons.map((item) => {
                const selected = selectedReason === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setSelectedReason(item);
                      setError(null);
                    }}
                    className={`app-pressable flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border px-4 text-left text-xs font-bold ${
                      selected
                        ? "border-apois-yellow/50 bg-apois-yellow/10 text-white"
                        : "border-white/8 bg-white/[0.03] text-zinc-400"
                    }`}
                  >
                    {item}
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                        selected
                          ? "border-apois-yellow bg-apois-yellow text-black"
                          : "border-zinc-700"
                      }`}
                    >
                      {selected ? <Check size={12} strokeWidth={3} /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {selectedReason === "Outro motivo" ? (
            <label className="block">
              <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
                Descreva o motivo
              </span>
              <textarea
                value={customReason}
                onChange={(event) => setCustomReason(event.target.value.slice(0, 300))}
                rows={3}
                placeholder="Explique brevemente o motivo do cancelamento."
                className="w-full resize-none rounded-2xl border border-white/10 bg-black/40 p-4 text-base text-white outline-none placeholder:text-zinc-600 focus:border-apois-yellow"
              />
            </label>
          ) : null}

          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs font-bold leading-5 text-red-300"
            >
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="mt-2 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void handleCancel()}
            disabled={isCancelling || isPolicyLoading || Boolean(policyError) || !reason}
            className="app-pressable flex min-h-12 w-full items-center justify-center rounded-2xl bg-red-600 px-4 text-sm font-black text-white disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {isCancelling ? <Loader2 className="mr-2 animate-spin" size={18} /> : null}
            {feeWouldApply
              ? `Cancelar e aceitar multa de ${formatCurrency(policy.amount)}`
              : "Confirmar cancelamento"}
          </button>
          <button
            type="button"
            className="app-pressable min-h-12 w-full rounded-2xl text-sm font-black text-zinc-400"
            onClick={onClose}
            disabled={isCancelling}
          >
            Manter corrida
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
