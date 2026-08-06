import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarClock,
  Car,
  CheckCircle2,
  Clock3,
  Copy,
  CreditCard,
  MapPin,
  Printer,
  RefreshCw,
  RotateCcw,
  Route as RouteIcon,
  Share2,
  Star,
  UserRound,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { RideRatingCard } from "@/components/rides/RideRatingCard";
import { useAuth } from "@/hooks/use-auth";
import { useRepeatRide } from "@/hooks/rides/use-repeat-ride";
import { rideHistoryService } from "@/services/rides/ride-history-service";
import type { RideHistoryItem } from "@/types/rides/ride-history";
import { cn, formatCurrency } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/corridas/$rideId")({
  component: RideDetailsPage,
});

function formatDate(value: string | null): string {
  if (!value) return "Não informado";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

function statusInfo(ride: RideHistoryItem): {
  label: string;
  className: string;
  icon: typeof CheckCircle2;
} {
  if (ride.status === "finalizada") {
    return {
      label: "Corrida concluída",
      className: "border-apois-success/25 bg-apois-success/10 text-apois-success",
      icon: CheckCircle2,
    };
  }

  if (["cancelada_passageiro", "cancelada_motorista", "expired"].includes(ride.status)) {
    return {
      label:
        ride.status === "cancelada_motorista"
          ? "Cancelada pelo motorista"
          : ride.status === "expired"
            ? "Corrida expirada"
            : "Cancelada por você",
      className: "border-red-500/25 bg-red-500/10 text-red-400",
      icon: XCircle,
    };
  }

  return {
    label: "Corrida em andamento",
    className: "border-apois-yellow/25 bg-apois-yellow/10 text-apois-yellow",
    icon: Clock3,
  };
}

function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    carros: "Carro",
    carro: "Carro",
    motos: "Moto",
    moto: "Moto",
    fretes: "Fretes e Mudanças",
    guincho: "Guincho",
    envios: "Envios",
  };
  return labels[category] ?? category;
}

function paymentLabel(paymentMethod: string): string {
  const labels: Record<string, string> = {
    pix: "PIX",
    credit: "Cartão de crédito",
    credit_card: "Cartão de crédito",
    debit: "Cartão de débito",
    debit_card: "Cartão de débito",
    cash: "Dinheiro",
    money: "Dinheiro",
    wallet: "Carteira APOIS",
  };
  return labels[paymentMethod] ?? paymentMethod;
}

async function copyText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
  await navigator.clipboard.writeText(text);
}

function RideDetailsPage() {
  const { rideId } = Route.useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const repeatRide = useRepeatRide();
  const [ride, setRide] = useState<RideHistoryItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRepeating, setIsRepeating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRide = useCallback(async () => {
    if (!profile?.id) return;
    setIsLoading(true);
    setError(null);
    try {
      setRide(await rideHistoryService.getById(rideId, profile.id));
    } catch (caughtError: unknown) {
      console.error("[RideDetailsPage] Ride load failed", caughtError);
      setError("Não foi possível carregar os detalhes desta corrida.");
    } finally {
      setIsLoading(false);
    }
  }, [profile?.id, rideId]);

  useEffect(() => {
    void loadRide();
  }, [loadRide]);

  const receiptText = useMemo(() => {
    if (!ride) return "";
    const value = ride.finalPrice ?? ride.estimatedPrice;
    return [
      "APOIS — Comprovante de corrida",
      `Corrida: ${ride.id}`,
      `Data: ${formatDate(ride.completedAt ?? ride.cancelledAt ?? ride.createdAt)}`,
      `Origem: ${ride.originName}`,
      `Destino: ${ride.destinationName}`,
      `Categoria: ${categoryLabel(ride.category)}`,
      `Pagamento: ${paymentLabel(ride.paymentMethod)}`,
      `Valor: ${formatCurrency(value)}`,
      `Status: ${statusInfo(ride).label}`,
    ].join("\n");
  }, [ride]);

  const handleRepeatRide = async (): Promise<void> => {
    if (!ride || isRepeating) return;
    setIsRepeating(true);
    try {
      await repeatRide(ride);
    } catch (caughtError: unknown) {
      console.error("[RideDetailsPage] Repeat ride failed", caughtError);
      toast.error("Não foi possível preparar esta corrida novamente.");
    } finally {
      setIsRepeating(false);
    }
  };

  const shareReceipt = async (): Promise<void> => {
    if (!ride || !receiptText) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Comprovante de corrida APOIS",
          text: receiptText,
        });
        return;
      }
      await copyText(receiptText);
      toast.success("Comprovante copiado.");
    } catch (caughtError: unknown) {
      if (caughtError instanceof DOMException && caughtError.name === "AbortError") return;
      toast.error("Não foi possível compartilhar o comprovante.");
    }
  };

  if (isLoading) {
    return (
      <div className="app-screen min-h-[100dvh] bg-black px-5 py-6 text-white">
        <div className="h-12 w-12 animate-pulse rounded-2xl bg-zinc-900" />
        <div className="mt-6 h-28 animate-pulse rounded-3xl bg-zinc-900" />
        <div className="mt-4 h-72 animate-pulse rounded-3xl bg-zinc-900" />
      </div>
    );
  }

  if (error || !ride) {
    return (
      <div className="app-screen flex min-h-[100dvh] flex-col items-center justify-center bg-black p-8 text-center text-white">
        <XCircle className="text-red-400" size={42} />
        <h1 className="mt-4 text-xl font-black">Detalhes indisponíveis</h1>
        <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">
          {error ?? "Esta corrida não foi encontrada."}
        </p>
        <button
          type="button"
          onClick={() => void loadRide()}
          className="app-pressable mt-5 flex min-h-12 items-center gap-2 rounded-2xl bg-apois-yellow px-5 text-sm font-black text-black"
        >
          <RefreshCw size={17} />
          Tentar novamente
        </button>
      </div>
    );
  }

  const status = statusInfo(ride);
  const StatusIcon = status.icon;
  const totalValue = ride.finalPrice ?? ride.estimatedPrice;
  const finishedAt = ride.completedAt ?? ride.cancelledAt ?? ride.updatedAt;
  const isActive = [
    "procurar_motorista",
    "motorista_a_caminho",
    "motorista_chegou",
    "em_viagem",
  ].includes(ride.status);

  return (
    <div className="app-screen min-h-[100dvh] bg-black text-white print:bg-white print:text-black">
      <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-white/8 bg-black/92 px-5 pb-4 pt-safe-area-inset-top backdrop-blur-xl print:hidden">
        <button
          type="button"
          aria-label="Voltar ao histórico"
          onClick={() => void navigate({ to: "/corridas" })}
          className="app-pressable mt-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900"
        >
          <ArrowLeft size={19} />
        </button>
        <div className="mt-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-apois-yellow">
            Detalhes da viagem
          </p>
          <h1 className="text-xl font-black">Comprovante da corrida</h1>
        </div>
      </header>

      <main className="app-scroll px-5 pb-8 pt-5 print:p-0">
        <section className="mx-auto max-w-xl rounded-[32px] border border-white/10 bg-zinc-950 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.3)] print:border-zinc-300 print:bg-white print:shadow-none">
          <div className="flex items-start justify-between gap-4 border-b border-white/8 pb-5 print:border-zinc-200">
            <div>
              <p className="text-2xl font-black tracking-[-0.05em] text-apois-yellow">APOIS</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                Comprovante de corrida
              </p>
            </div>
            <div
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-black",
                status.className,
              )}
            >
              <StatusIcon size={15} />
              {status.label}
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-white/8 bg-black/30 p-4 print:border-zinc-200 print:bg-zinc-50">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-600">
              Identificação
            </p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <code className="truncate text-xs font-bold text-zinc-300 print:text-zinc-700">
                {ride.id}
              </code>
              <button
                type="button"
                aria-label="Copiar identificação da corrida"
                onClick={() => {
                  void copyText(ride.id)
                    .then(() => toast.success("Identificação copiada."))
                    .catch(() => toast.error("Não foi possível copiar a identificação."));
                }}
                className="app-pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-zinc-400 print:hidden"
              >
                <Copy size={15} />
              </button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-[18px_1fr] gap-x-3 gap-y-5">
            <span className="mt-1 h-3 w-3 rounded-full bg-apois-success" />
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-zinc-600">
                Origem
              </p>
              <p className="mt-1 text-sm font-bold text-zinc-200 print:text-zinc-900">
                {ride.originName}
              </p>
            </div>

            {ride.intermediates.map((stop, index) => (
              <div key={`${stop.lat}:${stop.lng}:${index}`} className="contents">
                <span className="mt-1 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-800 text-[8px] font-black text-white">
                  {index + 1}
                </span>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] text-zinc-600">
                    Parada {index + 1}
                  </p>
                  <p className="mt-1 text-sm font-bold text-zinc-300 print:text-zinc-800">
                    {stop.label ?? stop.address ?? "Parada intermediária"}
                  </p>
                </div>
              </div>
            ))}

            <MapPin className="-ml-1 text-apois-yellow" size={20} />
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-zinc-600">
                Destino
              </p>
              <p className="mt-1 text-sm font-black text-white print:text-black">
                {ride.destinationName}
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <InfoCard icon={CalendarClock} label="Solicitada em" value={formatDate(ride.createdAt)} />
            <InfoCard icon={Clock3} label="Encerrada em" value={formatDate(finishedAt)} />
            <InfoCard
              icon={RouteIcon}
              label="Distância"
              value={
                ride.distanceKm !== null
                  ? `${ride.distanceKm.toFixed(1).replace(".", ",")} km`
                  : "Não informada"
              }
            />
            <InfoCard
              icon={Clock3}
              label="Duração"
              value={ride.durationMin !== null ? `${Math.round(ride.durationMin)} min` : "Não informada"}
            />
            <InfoCard icon={Car} label="Categoria" value={categoryLabel(ride.category)} />
            <InfoCard icon={CreditCard} label="Pagamento" value={paymentLabel(ride.paymentMethod)} />
          </div>

          {ride.driverName || ride.driverVehicleModel ? (
            <section className="mt-6 rounded-2xl border border-white/8 bg-white/[0.03] p-4 print:border-zinc-200">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-900 text-zinc-400 print:bg-zinc-100">
                  <UserRound size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] text-zinc-600">
                    Motorista
                  </p>
                  <p className="mt-1 truncate text-sm font-black text-white print:text-black">
                    {ride.driverName ?? "Não informado"}
                  </p>
                  {ride.driverRating !== null ? (
                    <p className="mt-1 flex items-center gap-1 text-xs font-bold text-apois-yellow">
                      <Star size={12} fill="currentColor" />
                      {ride.driverRating.toFixed(1).replace(".", ",")}
                    </p>
                  ) : null}
                </div>
              </div>
              {ride.driverVehicleModel || ride.driverVehiclePlate ? (
                <div className="mt-4 border-t border-white/8 pt-4 text-xs text-zinc-400 print:border-zinc-200 print:text-zinc-700">
                  <p className="font-bold">
                    {[ride.driverVehicleModel, ride.driverVehicleColor].filter(Boolean).join(" • ")}
                  </p>
                  {ride.driverVehiclePlate ? (
                    <p className="mt-1 font-black uppercase tracking-[0.12em] text-white print:text-black">
                      {ride.driverVehiclePlate}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          {ride.cancellationReason ? (
            <section className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-red-300">
                Cancelamento
              </p>
              <p className="mt-2 text-sm font-bold leading-6 text-red-100">
                {ride.cancellationReason}
              </p>
              {ride.cancellationFee && ride.cancellationFee > 0 ? (
                <p className="mt-2 text-xs font-black text-red-300">
                  Multa registrada: {formatCurrency(ride.cancellationFee)}
                </p>
              ) : null}
            </section>
          ) : null}

          <div className="mt-6 flex items-end justify-between border-t border-white/8 pt-5 print:border-zinc-200">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-600">
                Valor total
              </p>
              <p className="mt-1 text-xs font-bold text-zinc-500">
                {paymentLabel(ride.paymentMethod)}
              </p>
            </div>
            <p className="text-3xl font-black tracking-[-0.05em] text-white print:text-black">
              {formatCurrency(totalValue)}
            </p>
          </div>

          {ride.passengerRating !== null ? (
            <div className="mt-5 flex items-center justify-between rounded-2xl bg-apois-yellow/10 px-4 py-3">
              <span className="text-xs font-black text-zinc-300 print:text-zinc-700">
                Sua avaliação
              </span>
              <span className="flex items-center gap-1 text-sm font-black text-apois-yellow">
                <Star size={15} fill="currentColor" />
                {ride.passengerRating.toFixed(0)} de 5
              </span>
            </div>
          ) : null}
        </section>

        {ride.status === "finalizada" && ride.passengerRating === null ? (
          <div className="mx-auto mt-5 max-w-xl print:hidden">
            <RideRatingCard
              rideId={ride.id}
              driverName={ride.driverName}
              currentRating={ride.passengerRating}
              onRated={() => loadRide()}
            />
          </div>
        ) : null}

        <div className="mx-auto mt-5 grid max-w-xl gap-3 print:hidden">
          {isActive ? (
            <button
              type="button"
              onClick={() =>
                void navigate({
                  to: "/corrida/$rideId",
                  params: { rideId: ride.id },
                })
              }
              className="app-pressable flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-apois-yellow text-sm font-black text-black"
            >
              Acompanhar corrida em andamento
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleRepeatRide()}
              disabled={isRepeating}
              className="app-pressable flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-apois-yellow text-sm font-black text-black disabled:opacity-60"
            >
              <RotateCcw className={isRepeating ? "animate-spin" : ""} size={18} />
              {isRepeating ? "Preparando corrida..." : "Repetir corrida completa"}
            </button>
          )}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => void shareReceipt()}
              className="app-pressable flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-zinc-900 text-xs font-black"
            >
              <Share2 size={16} />
              Compartilhar
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="app-pressable flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-zinc-900 text-xs font-black"
            >
              <Printer size={16} />
              Imprimir / PDF
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 print:border-zinc-200">
      <Icon className="text-apois-yellow" size={17} />
      <p className="mt-3 text-[9px] font-black uppercase tracking-[0.15em] text-zinc-600">
        {label}
      </p>
      <p className="mt-1 text-xs font-black leading-5 text-zinc-200 print:text-zinc-800">
        {value}
      </p>
    </div>
  );
}
