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
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(date);
}

function statusInfo(ride: RideHistoryItem): { label: string; className: string; icon: typeof CheckCircle2 } {
  if (ride.status === "finalizada") return { label: "Corrida concluída", className: "border-apois-success/25 bg-apois-success/10 text-apois-success", icon: CheckCircle2 };
  if (["cancelada_passageiro", "cancelada_motorista", "expired"].includes(ride.status)) {
    return {
      label: ride.status === "cancelada_motorista" ? "Cancelada pelo motorista" : ride.status === "expired" ? "Busca encerrada" : "Cancelada por você",
      className: "border-red-500/25 bg-red-500/10 text-red-400",
      icon: XCircle,
    };
  }
  return { label: "Corrida em andamento", className: "border-apois-yellow/25 bg-apois-yellow/10 text-apois-yellow", icon: Clock3 };
}

function categoryLabel(category: string): string {
  const labels: Record<string, string> = { carros: "Carro", carro: "Carro", motos: "Moto", moto: "Moto", fretes: "Fretes e Mudanças", guincho: "Guincho", envios: "Envios" };
  return labels[category] ?? "Categoria de serviço";
}

function paymentLabel(paymentMethod: string): string {
  const labels: Record<string, string> = { pix: "PIX", credit: "Cartão de crédito", credit_card: "Cartão de crédito", debit: "Cartão de débito", debit_card: "Cartão de débito", cash: "Dinheiro", money: "Dinheiro", wallet: "Carteira APOIS" };
  return labels[paymentMethod] ?? "Pagamento registrado";
}

function paymentStatusLabel(status: string): string {
  const labels: Record<string, string> = { pending: "Aguardando confirmação do pagamento", confirmed: "Pagamento confirmado", failed: "Pagamento não confirmado", refunded: "Pagamento reembolsado", cash_pending: "Aguardando confirmação do pagamento em dinheiro", cash_confirmed: "Pagamento em dinheiro confirmado" };
  return labels[status] ?? "Situação do pagamento indisponível";
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
    try { setRide(await rideHistoryService.getById(rideId, profile.id)); }
    catch (caughtError: unknown) { console.error("[RideDetailsPage] Ride load failed", caughtError); setError("Não foi possível carregar os detalhes desta corrida."); }
    finally { setIsLoading(false); }
  }, [profile?.id, rideId]);

  useEffect(() => { void loadRide(); }, [loadRide]);

  const receiptText = useMemo(() => {
    if (!ride) return "";
    const settlement = ride.settlement;
    const value = settlement?.passengerCharge ?? ride.finalPrice ?? ride.estimatedPrice;
    const lines = [
      "APOIS — Comprovante de corrida",
      `Corrida: ${ride.id}`,
      `Data: ${formatDate(ride.completedAt ?? ride.cancelledAt ?? ride.createdAt)}`,
      `Origem: ${ride.originName}`,
      `Destino: ${ride.destinationName}`,
      `Categoria: ${categoryLabel(ride.category)}`,
      `Pagamento: ${paymentLabel(settlement?.paymentMethod ?? ride.paymentMethod)}`,
    ];
    if (settlement) {
      lines.push(`Situação do pagamento: ${paymentStatusLabel(settlement.paymentStatus)}`);
      lines.push(`Valor bruto: ${formatCurrency(settlement.grossAmount)}`);
      if (settlement.discountAmount !== null) lines.push(`Desconto: ${formatCurrency(settlement.discountAmount)}`);
      if (settlement.platformFee !== null) lines.push(`Taxa APOIS: ${formatCurrency(settlement.platformFee)}`);
      if (settlement.paymentProviderFee !== null) lines.push(`Taxa de processamento do pagamento: ${formatCurrency(settlement.paymentProviderFee)}`);
    }
    lines.push(`Total: ${formatCurrency(value)}`);
    lines.push(`Status: ${statusInfo(ride).label}`);
    return lines.join("\n");
  }, [ride]);

  const handleRepeatRide = async (): Promise<void> => {
    if (!ride || isRepeating) return;
    setIsRepeating(true);
    try { await repeatRide(ride); }
    catch (caughtError: unknown) { console.error("[RideDetailsPage] Repeat ride failed", caughtError); toast.error("Não foi possível preparar esta corrida novamente."); }
    finally { setIsRepeating(false); }
  };

  const shareReceipt = async (): Promise<void> => {
    if (!ride || !receiptText) return;
    try {
      if (navigator.share) { await navigator.share({ title: "Comprovante de corrida APOIS", text: receiptText }); return; }
      await copyText(receiptText);
      toast.success("Comprovante copiado.");
    } catch (caughtError: unknown) {
      if (caughtError instanceof DOMException && caughtError.name === "AbortError") return;
      toast.error("Não foi possível compartilhar o comprovante.");
    }
  };

  if (isLoading) {
    return <div className="app-screen min-h-[100dvh] bg-black px-4 py-6 text-white sm:px-5" role="status" aria-label="Carregando detalhes da corrida"><div className="h-12 w-12 animate-pulse rounded-2xl bg-zinc-900" /><div className="mt-6 h-28 animate-pulse rounded-3xl bg-zinc-900" /><div className="mt-4 h-72 animate-pulse rounded-3xl bg-zinc-900" /></div>;
  }

  if (error || !ride) {
    return <div className="app-screen flex min-h-[100dvh] min-w-0 flex-col items-center justify-center bg-black p-5 text-center text-white sm:p-8" role="alert"><XCircle className="text-red-400" size={42} aria-hidden="true" /><h1 className="mt-4 break-words text-xl font-black">Detalhes indisponíveis</h1><p className="mt-2 max-w-sm break-words text-sm leading-6 text-zinc-500">{error ?? "Esta corrida não foi encontrada."}</p><button type="button" onClick={() => void loadRide()} className="app-pressable mt-5 flex min-h-12 items-center gap-2 rounded-2xl bg-apois-yellow px-5 py-2 text-sm font-black text-black"><RefreshCw size={17} aria-hidden="true" />Tentar novamente</button></div>;
  }

  const status = statusInfo(ride);
  const StatusIcon = status.icon;
  const settlement = ride.settlement;
  const totalValue = settlement?.passengerCharge ?? ride.finalPrice ?? ride.estimatedPrice;
  const finishedAt = ride.completedAt ?? ride.cancelledAt ?? ride.updatedAt;
  const isActive = ["procurar_motorista", "motorista_a_caminho", "motorista_chegou", "em_viagem"].includes(ride.status);

  return (
    <div className="app-screen min-h-[100dvh] min-w-0 bg-black text-white print:bg-white print:text-black">
      <header className="sticky top-0 z-20 flex min-w-0 items-center gap-3 border-b border-white/8 bg-black/92 px-4 pb-4 pt-safe-area-inset-top backdrop-blur-xl print:hidden sm:px-5">
        <button type="button" aria-label="Voltar ao histórico" onClick={() => void navigate({ to: "/corridas" })} className="app-pressable mt-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900"><ArrowLeft size={19} aria-hidden="true" /></button>
        <div className="mt-4 min-w-0 flex-1"><p className="break-words text-[10px] font-black uppercase tracking-[0.16em] text-apois-yellow sm:tracking-[0.2em]">Detalhes da viagem</p><h1 className="break-words text-xl font-black leading-6">Comprovante da corrida</h1></div>
      </header>

      <main className="app-scroll min-w-0 px-4 pb-8 pt-5 print:p-0 sm:px-5">
        <section className="mx-auto min-w-0 max-w-xl rounded-[32px] border border-white/10 bg-zinc-950 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.3)] print:border-zinc-300 print:bg-white print:shadow-none sm:p-5">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-white/8 pb-5 print:border-zinc-200"><div className="min-w-0"><p className="text-2xl font-black tracking-[-0.05em] text-apois-yellow">APOIS</p><p className="mt-1 break-words text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Comprovante de corrida</p></div><div className={cn("flex max-w-full items-center gap-2 rounded-full border px-3 py-2 text-center text-[10px] font-black leading-4", status.className)}><StatusIcon size={15} className="shrink-0" aria-hidden="true" /><span className="break-words">{status.label}</span></div></div>

          <div className="mt-5 min-w-0 rounded-2xl border border-white/8 bg-black/30 p-4 print:border-zinc-200 print:bg-zinc-50"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600">Identificação</p><div className="mt-2 flex min-w-0 items-start gap-3"><code className="min-w-0 flex-1 break-all text-xs font-bold leading-5 text-zinc-300 print:text-zinc-700">{ride.id}</code><button type="button" aria-label="Copiar identificação da corrida" onClick={() => { void copyText(ride.id).then(() => toast.success("Identificação copiada.")).catch(() => toast.error("Não foi possível copiar a identificação.")); }} className="app-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/5 text-zinc-400 print:hidden"><Copy size={15} aria-hidden="true" /></button></div></div>

          <div className="mt-6 grid min-w-0 grid-cols-[18px_minmax(0,1fr)] gap-x-3 gap-y-5">
            <span className="mt-1 h-3 w-3 rounded-full bg-apois-success" aria-hidden="true" /><AddressBlock label="Origem" value={ride.originName} />
            {ride.intermediates.map((stop, index) => <div key={`${stop.lat}:${stop.lng}:${index}`} className="contents"><span className="mt-1 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-800 text-[8px] font-black text-white" aria-hidden="true">{index + 1}</span><AddressBlock label={`Parada ${index + 1}`} value={stop.label ?? stop.address ?? "Parada intermediária"} /></div>)}
            <MapPin className="-ml-1 shrink-0 text-apois-yellow" size={20} aria-hidden="true" /><AddressBlock label="Destino" value={ride.destinationName} strong />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 max-[339px]:grid-cols-1">
            <InfoCard icon={CalendarClock} label="Solicitada em" value={formatDate(ride.createdAt)} />
            <InfoCard icon={Clock3} label="Encerrada em" value={formatDate(finishedAt)} />
            <InfoCard icon={RouteIcon} label="Distância" value={ride.distanceKm !== null ? `${ride.distanceKm.toFixed(1).replace(".", ",")} km` : "Não informada"} />
            <InfoCard icon={Clock3} label="Duração" value={ride.durationMin !== null ? `${Math.round(ride.durationMin)} min` : "Não informada"} />
            <InfoCard icon={Car} label="Categoria" value={categoryLabel(ride.category)} />
            <InfoCard icon={CreditCard} label="Pagamento" value={paymentLabel(settlement?.paymentMethod ?? ride.paymentMethod)} />
          </div>

          {ride.driverName || ride.driverVehicleModel ? <section className="mt-6 min-w-0 rounded-2xl border border-white/8 bg-white/[0.03] p-4 print:border-zinc-200"><div className="flex min-w-0 items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-900 text-zinc-400 print:bg-zinc-100"><UserRound size={20} aria-hidden="true" /></div><div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600">Motorista</p><p className="mt-1 break-words text-sm font-black leading-5 text-white print:text-black">{ride.driverName ?? "Não informado"}</p>{ride.driverRating !== null ? <p className="mt-1 flex items-center gap-1 text-xs font-bold text-apois-yellow"><Star size={12} fill="currentColor" aria-hidden="true" />{ride.driverRating.toFixed(1).replace(".", ",")}</p> : null}</div></div>{ride.driverVehicleModel || ride.driverVehiclePlate ? <div className="mt-4 min-w-0 border-t border-white/8 pt-4 text-xs text-zinc-400 print:border-zinc-200 print:text-zinc-700"><p className="break-words font-bold leading-5">{[ride.driverVehicleModel, ride.driverVehicleColor].filter(Boolean).join(" • ")}</p>{ride.driverVehiclePlate ? <p className="mt-1 break-words font-black uppercase tracking-[0.12em] text-white print:text-black">{ride.driverVehiclePlate}</p> : null}</div> : null}</section> : null}

          {ride.cancellationReason ? <section className="mt-6 min-w-0 rounded-2xl border border-red-500/20 bg-red-500/10 p-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-red-300">Cancelamento</p><p className="mt-2 break-words text-sm font-bold leading-6 text-red-100">{ride.cancellationReason}</p>{ride.cancellationFee && ride.cancellationFee > 0 ? <p className="mt-2 max-w-full break-words text-xs font-black tabular-nums text-red-300">Multa registrada: {formatCurrency(ride.cancellationFee)}</p> : null}</section> : null}

          {ride.status === "finalizada" ? <section className="mt-6 min-w-0 rounded-2xl border border-white/8 bg-white/[0.03] p-4 print:border-zinc-200"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600">Liquidação da corrida</p><p className="mt-1 break-words text-xs font-black leading-5 text-zinc-200 print:text-zinc-800">{settlement ? paymentStatusLabel(settlement.paymentStatus) : "Detalhamento financeiro ainda indisponível"}</p></div><CreditCard className="shrink-0 text-apois-yellow" size={20} aria-hidden="true" /></div>{settlement ? <div className="mt-4 space-y-2 border-t border-white/8 pt-4 text-xs print:border-zinc-200"><ReceiptLine label="Valor bruto" value={formatCurrency(settlement.grossAmount)} /><ReceiptLine label="Desconto" value={settlement.discountAmount === null ? "Não discriminado" : formatCurrency(settlement.discountAmount)} /><ReceiptLine label="Taxa APOIS" value={settlement.platformFee === null ? "Não consolidada" : formatCurrency(settlement.platformFee)} />{settlement.paymentProviderFee !== null ? <ReceiptLine label="Taxa de processamento do pagamento" value={formatCurrency(settlement.paymentProviderFee)} /> : null}{settlement.refundedAmount !== null && settlement.refundedAmount > 0 ? <ReceiptLine label="Valor reembolsado" value={formatCurrency(settlement.refundedAmount)} /> : null}<ReceiptLine label="Total do passageiro" value={formatCurrency(settlement.passengerCharge)} strong />{settlement.paymentStatus === "pending" ? <p className="break-words pt-2 text-[11px] font-bold leading-5 text-apois-yellow print:text-zinc-700">O pagamento eletrônico ainda aguarda confirmação. O comprovante só marca a corrida como paga depois da confirmação financeira.</p> : null}</div> : <p className="mt-3 break-words text-[11px] font-bold leading-5 text-zinc-500">O detalhamento financeiro desta corrida ainda não está disponível. O aplicativo não apresenta valores adicionais sem confirmação.</p>}</section> : null}

          <div className="mt-6 flex min-w-0 flex-wrap items-end justify-between gap-3 border-t border-white/8 pt-5 print:border-zinc-200"><div className="min-w-[150px] flex-1"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600">Valor total</p><p className="mt-1 break-words text-xs font-bold leading-5 text-zinc-500">{paymentLabel(settlement?.paymentMethod ?? ride.paymentMethod)}</p></div><p className="max-w-full break-words text-[clamp(24px,9vw,30px)] font-black tracking-[-0.05em] tabular-nums text-white print:text-black">{formatCurrency(totalValue)}</p></div>

          {ride.passengerRating !== null ? <div className="mt-5 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-2xl bg-apois-yellow/10 px-4 py-3"><span className="break-words text-xs font-black text-zinc-300 print:text-zinc-700">Sua avaliação</span><span className="flex items-center gap-1 text-sm font-black text-apois-yellow"><Star size={15} fill="currentColor" aria-hidden="true" />{ride.passengerRating.toFixed(0)} de 5</span></div> : null}
        </section>

        {ride.status === "finalizada" && ride.passengerRating === null ? <div className="mx-auto mt-5 max-w-xl print:hidden"><RideRatingCard rideId={ride.id} driverName={ride.driverName} currentRating={ride.passengerRating} onRated={() => loadRide()} /></div> : null}

        <div className="mx-auto mt-5 grid max-w-xl gap-3 print:hidden">
          {isActive ? <button type="button" onClick={() => void navigate({ to: "/corrida/$rideId", params: { rideId: ride.id } })} className="app-pressable flex min-h-14 items-center justify-center rounded-2xl bg-apois-yellow px-4 py-3 text-center text-sm font-black leading-5 text-black">Acompanhar corrida em andamento</button> : <button type="button" onClick={() => void handleRepeatRide()} disabled={isRepeating} aria-busy={isRepeating} className="app-pressable flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-apois-yellow px-4 py-3 text-center text-sm font-black leading-5 text-black disabled:opacity-60"><RotateCcw className={`shrink-0 ${isRepeating ? "animate-spin" : ""}`} size={18} aria-hidden="true" />{isRepeating ? "Preparando corrida..." : "Repetir corrida completa"}</button>}
          <div className="grid grid-cols-2 gap-3 max-[359px]:grid-cols-1"><button type="button" onClick={() => void shareReceipt()} className="app-pressable flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-zinc-900 px-3 py-2 text-center text-xs font-black leading-5"><Share2 size={16} className="shrink-0" aria-hidden="true" />Compartilhar</button><button type="button" onClick={() => window.print()} className="app-pressable flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-zinc-900 px-3 py-2 text-center text-xs font-black leading-5"><Printer size={16} className="shrink-0" aria-hidden="true" />Imprimir / PDF</button></div>
        </div>
      </main>
    </div>
  );
}

function AddressBlock({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600">{label}</p><p className={cn("mt-1 break-words text-sm leading-5 print:text-zinc-900", strong ? "font-black text-white" : "font-bold text-zinc-200")}>{value}</p></div>;
}

function ReceiptLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-1"><span className="min-w-[130px] flex-1 break-words font-bold text-zinc-500">{label}</span><span className={cn("max-w-full break-words text-right tabular-nums text-zinc-200 print:text-zinc-800", strong && "font-black text-white print:text-black")}>{value}</span></div>;
}

function InfoCard({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string }) {
  return <div className="min-w-0 rounded-2xl border border-white/8 bg-white/[0.03] p-4 print:border-zinc-200"><Icon className="text-apois-yellow" size={17} aria-hidden="true" /><p className="mt-3 text-[10px] font-black uppercase tracking-[0.15em] text-zinc-600">{label}</p><p className="mt-1 break-words text-xs font-black leading-5 text-zinc-200 print:text-zinc-800">{value}</p></div>;
}
