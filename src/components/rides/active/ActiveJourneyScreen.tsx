import { useMemo } from "react";
import {
  BellRing,
  CarFront,
  ChevronLeft,
  Clock3,
  CreditCard,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  RefreshCw,
  Share2,
  ShieldCheck,
  Star,
  X,
} from "lucide-react";
import { ActiveRideMap } from "@/components/map/ActiveRideMap";
import type { ActiveRide, RideStatus } from "@/types/rides/active-ride";
import { cn } from "@/lib/utils";

interface ActiveJourneyScreenProps {
  ride: ActiveRide;
  status: RideStatus;
  isRefreshing: boolean;
  isRealtimeConnected: boolean;
  canCancel: boolean;
  canShare: boolean;
  canOpenSafety: boolean;
  isSharing: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onCancel: () => void;
  onShare: () => void;
  onSafety: () => void;
}

const paymentLabels: Record<string, string> = {
  pix: "Pix",
  credit: "Cartão de crédito",
  credit_card: "Cartão de crédito",
  debit: "Cartão de débito",
  debit_card: "Cartão de débito",
  cash: "Dinheiro",
  money: "Dinheiro",
  wallet: "Carteira APOIS",
  corporate: "Corporativo",
};

const categoryLabels: Record<string, string> = {
  carros: "Carro",
  carro: "Carro",
  motos: "Moto",
  moto: "Moto",
  fretes: "Fretes e Mudanças",
  frete: "Fretes e Mudanças",
  guincho: "Guincho",
  envios: "Envios",
  envio: "Envios",
};

function safeNonNegative(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function formatMoney(value: number | null): string {
  if (value === null) return "Valor em atualização";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function firstName(value: string | null | undefined): string {
  const normalized = value?.trim().split(/\s+/)[0];
  return normalized || "Motorista parceiro";
}

function phoneHref(value: string | null | undefined, scheme: "tel" | "sms"): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/[^\d+]/g, "");
  if (!/^\+?\d{8,15}$/.test(normalized)) return null;
  return `${scheme}:${normalized}`;
}

function statusCopy(status: RideStatus) {
  if (status === "motorista_a_caminho") {
    return { title: "Motorista a caminho", subtitle: "Acompanhe a aproximação em tempo real", badge: "A caminho do embarque" };
  }
  if (status === "motorista_chegou") {
    return { title: "Motorista chegou", subtitle: "Encontre o veículo e confira o código de segurança", badge: "Motorista no embarque" };
  }
  return { title: "Corrida em andamento", subtitle: "Acompanhe sua viagem em tempo real", badge: "Viagem em andamento" };
}

export function ActiveJourneyScreen({
  ride,
  status,
  isRefreshing,
  isRealtimeConnected,
  canCancel,
  canShare,
  canOpenSafety,
  isSharing,
  onBack,
  onRefresh,
  onCancel,
  onShare,
  onSafety,
}: ActiveJourneyScreenProps) {
  const copy = statusCopy(status);
  const securityCode = ride.security_code?.replace(/\D/g, "").slice(0, 4) ?? "";
  const showPin = ["motorista_a_caminho", "motorista_chegou"].includes(status) && /^\d{4}$/.test(securityCode);
  const totalPrice = safeNonNegative(ride.final_price ?? ride.estimated_price);
  const categoryKey = String(ride.category ?? "").trim().toLowerCase();
  const paymentKey = String(ride.payment_method ?? "").trim().toLowerCase();
  const category = categoryLabels[categoryKey] || "Categoria de serviço";
  const payment = paymentLabels[paymentKey] || "Pagamento registrado";
  const driverName = firstName(ride.driver_name);
  const distanceKm = safeNonNegative(ride.distance_km);
  const durationMin = safeNonNegative(ride.duration_min);
  const rating = safeNonNegative(ride.driver_rating);
  const plate = ride.driver_vehicle_plate?.trim().toUpperCase() ?? "";
  const origin = ride.origin_name?.trim() || "Origem selecionada";
  const destination = ride.destination_name?.trim() || "Destino selecionado";
  const callHref = phoneHref(ride.driver_phone, "tel");
  const messageHref = phoneHref(ride.driver_phone, "sms");

  const driverVehicle = useMemo(
    () =>
      [ride.driver_vehicle_model?.trim(), ride.driver_vehicle_color?.trim()]
        .filter((value): value is string => Boolean(value))
        .join(" • "),
    [ride.driver_vehicle_color, ride.driver_vehicle_model],
  );

  const handleCall = () => {
    if (callHref) window.location.href = callHref;
  };

  const handleMessage = () => {
    if (messageHref) window.location.href = messageHref;
  };

  return (
    <div className="relative flex h-[100dvh] min-h-0 min-w-0 flex-col overflow-hidden bg-black text-white">
      <header className="app-safe-top app-safe-x relative z-30 shrink-0 border-b border-white/5 bg-black/96 pb-3 pt-2 backdrop-blur-xl">
        <div className="grid min-w-0 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2 sm:gap-3">
          <button type="button" onClick={onBack} aria-label="Voltar" className="app-pressable flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-apois-yellow">
            <ChevronLeft size={24} strokeWidth={2.6} aria-hidden="true" />
          </button>
          <div className="min-w-0 text-center">
            <h1 className="break-words text-[18px] font-black leading-5 tracking-[-0.03em]">{copy.title}</h1>
            <p className="mt-0.5 break-words text-[10px] font-medium leading-4 text-zinc-500">{copy.subtitle}</p>
          </div>
          <div className="flex min-w-0 items-center gap-2" aria-hidden="true"><img src="/favicon.png" alt="" className="h-9 w-9 shrink-0 rounded-xl object-contain" /><span className="hidden text-[11px] font-black tracking-[0.16em] text-zinc-200 min-[390px]:block">APOIS</span></div>
        </div>
      </header>

      <main className="app-scroll min-h-0 min-w-0 flex-1 space-y-3 overflow-x-hidden px-3 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3">
        <section className="relative h-[330px] min-w-0 overflow-hidden rounded-[26px] border border-white/8 bg-[#101217] shadow-2xl max-[390px]:h-[300px] max-[340px]:h-[270px]">
          <ActiveRideMap ride={ride} />
          <div className="pointer-events-none absolute left-3 right-3 top-3 z-20">
            <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/82 px-3 py-2.5 shadow-xl backdrop-blur-xl">
              <div className="flex min-w-0 flex-1 items-center gap-2.5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-apois-yellow/25 bg-apois-yellow/10 text-apois-yellow" aria-hidden="true"><CarFront size={18} /></span><div className="min-w-0 flex-1"><p className="break-words text-[12px] font-black leading-4 text-apois-yellow">{copy.badge}</p><p className="mt-0.5 break-words text-[10px] leading-4 text-zinc-400">{isRealtimeConnected ? "Atualização em tempo real ativa" : "Reconectando atualizações…"}</p></div></div>
              <button type="button" aria-label={isRefreshing ? "Atualizando corrida" : "Atualizar corrida"} aria-busy={isRefreshing} onClick={onRefresh} disabled={isRefreshing} className="app-pressable pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 disabled:opacity-50"><RefreshCw size={15} aria-hidden="true" className={isRefreshing ? "animate-spin motion-reduce:animate-none" : ""} /></button>
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-20 flex min-w-0 items-end justify-between gap-2 max-[339px]:flex-col max-[339px]:items-stretch">
            <div className="min-w-0 max-w-[72%] flex-1 rounded-2xl border border-white/10 bg-black/85 px-3 py-2.5 shadow-xl backdrop-blur-xl max-[339px]:max-w-none"><div className="flex min-w-0 items-start gap-2.5"><MapPin className="mt-0.5 shrink-0 text-apois-yellow" size={18} aria-hidden="true" /><div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[0.13em] text-apois-yellow">Destino</p><p className="mt-1 break-words text-[12px] font-black leading-4 text-white">{destination}</p></div></div></div>
            <div className="shrink-0 rounded-2xl border border-white/10 bg-black/85 px-3 py-2.5 text-right shadow-xl backdrop-blur-xl max-[339px]:text-left"><p className="text-[10px] font-bold text-zinc-500">Distância</p><p className="mt-0.5 max-w-[96px] break-words text-[15px] font-black text-white max-[339px]:max-w-none">{distanceKm !== null ? `${distanceKm.toFixed(1).replace(".", ",")} km` : "Atualizando"}</p></div>
          </div>
        </section>

        <section className="min-w-0 rounded-[24px] border border-white/8 bg-[#0e1014] p-3 shadow-xl">
          <div className="flex min-w-0 items-center gap-3 max-[359px]:flex-wrap">
            <div className="flex h-[64px] w-[64px] shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-apois-yellow/45 bg-zinc-900 sm:h-[70px] sm:w-[70px]">{ride.driver_photo ? <img src={ride.driver_photo} alt={`Foto de ${driverName}`} className="h-full w-full object-cover" /> : <CarFront size={28} className="text-apois-yellow" aria-hidden="true" />}</div>
            <div className="min-w-[135px] flex-1"><div className="flex min-w-0 flex-wrap items-center gap-1.5"><p className="min-w-0 break-words text-[16px] font-black leading-5">{driverName}</p>{rating !== null && rating <= 5 ? <span className="flex shrink-0 items-center gap-1 text-[11px] font-black text-zinc-200" aria-label={`Avaliação ${rating.toFixed(1).replace(".", ",")} de 5`}><Star size={13} className="fill-apois-yellow text-apois-yellow" aria-hidden="true" />{rating.toFixed(1).replace(".", ",")}</span> : <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Novo</span>}</div><p className="mt-1 break-words text-[11px] font-medium leading-4 text-zinc-500">{driverVehicle || "Veículo confirmado"}</p>{plate ? <span className="mt-2 inline-flex max-w-full break-all rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[10px] font-black tracking-[0.08em] text-zinc-200" aria-label={`Placa ${plate}`}>{plate}</span> : null}</div>
            <div className="flex shrink-0 gap-2 max-[359px]:ml-[76px]"><button type="button" onClick={handleMessage} disabled={!messageHref} aria-label={`Enviar mensagem para ${driverName}`} className="app-pressable flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/30 text-apois-yellow disabled:opacity-35"><MessageCircle size={18} aria-hidden="true" /></button><button type="button" onClick={handleCall} disabled={!callHref} aria-label={`Ligar para ${driverName}`} className="app-pressable flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/30 text-apois-yellow disabled:opacity-35"><Phone size={18} aria-hidden="true" /></button></div>
          </div>
        </section>

        <section className="min-w-0 rounded-[24px] border border-white/8 bg-[#0e1014] p-3 shadow-xl"><div className="flex min-w-0 gap-3"><div className="flex w-4 shrink-0 flex-col items-center py-1" aria-hidden="true"><span className="h-3 w-3 rounded-full border-2 border-white bg-blue-500" /><span className="my-1 w-px flex-1 border-l border-dashed border-zinc-600" />{(ride.intermediates ?? []).map((stop, index) => <div key={`${stop.lat}:${stop.lng}:${index}`} className="contents"><span className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-apois-yellow bg-black text-[8px] font-black text-apois-yellow">{index + 1}</span><span className="my-1 w-px flex-1 border-l border-dashed border-zinc-600" /></div>)}<span className="h-3 w-3 rounded-full border-2 border-white bg-black" /></div><div className="min-w-0 flex-1 space-y-3"><JourneyAddress label="Origem" value={origin} />{(ride.intermediates ?? []).map((stop, index) => <JourneyAddress key={`${stop.lat}:${stop.lng}:${index}`} label={`Parada ${index + 1}`} value={stop.address?.trim() || stop.label?.trim() || `Parada ${index + 1}`} highlight />)}<JourneyAddress label="Destino" value={destination} /></div></div></section>

        <section className="grid min-w-0 grid-cols-2 gap-2 rounded-[24px] border border-white/8 bg-[#0e1014] p-3 shadow-xl max-[359px]:grid-cols-1">
          <DetailItem icon={CarFront} label="Categoria" value={category} /><DetailItem icon={Navigation} label="Distância total" value={distanceKm !== null ? `${distanceKm.toFixed(1).replace(".", ",")} km` : "Atualizando"} /><DetailItem icon={CreditCard} label="Pagamento" value={payment} /><DetailItem icon={Clock3} label="Tempo estimado" value={durationMin !== null ? `${Math.max(1, Math.round(durationMin))} min` : "Atualizando"} />{showPin ? <DetailItem icon={ShieldCheck} label="Código de segurança" value={securityCode} highlight /> : <DetailItem icon={ShieldCheck} label="Segurança" value={status === "em_viagem" ? "Viagem iniciada" : "Ativa"} />}<DetailItem icon={CreditCard} label="Preço da corrida" value={formatMoney(totalPrice)} highlight />
        </section>

        <div className="grid min-w-0 grid-cols-2 gap-2 max-[359px]:grid-cols-1">
          {canShare ? <button type="button" onClick={onShare} disabled={isSharing} aria-busy={isSharing} className="app-pressable flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-2xl border border-apois-yellow/45 bg-apois-yellow/[0.06] px-3 py-2 text-center text-[12px] font-black leading-5 text-apois-yellow disabled:opacity-50">{isSharing ? <RefreshCw size={16} className="shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Share2 size={16} className="shrink-0" aria-hidden="true" />}<span className="break-words">Compartilhar corrida</span></button> : null}
          {canOpenSafety ? <button type="button" onClick={onSafety} className="app-pressable flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-2xl border border-red-500/40 bg-red-500/[0.06] px-3 py-2 text-center text-[12px] font-black leading-5 text-red-400"><BellRing size={16} className="shrink-0" aria-hidden="true" /><span className="break-words">Segurança</span></button> : null}
        </div>

        {canCancel && status !== "em_viagem" ? <button type="button" onClick={onCancel} className="app-pressable flex min-h-11 w-full min-w-0 items-center justify-center gap-2 rounded-2xl border border-white/8 bg-white/[0.025] px-3 py-2 text-center text-[11px] font-black text-zinc-500"><X size={15} className="shrink-0" aria-hidden="true" /><span className="break-words">Cancelar corrida</span></button> : null}

        <div role="status" aria-live="polite" className={cn("flex min-w-0 items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-center text-[10px] font-bold leading-4", isRealtimeConnected ? "border-apois-yellow/20 bg-apois-yellow/[0.05] text-zinc-300" : "border-amber-500/20 bg-amber-500/[0.06] text-amber-300")}><ShieldCheck size={15} className="shrink-0 text-apois-yellow" aria-hidden="true" /><span className="break-words">{isRealtimeConnected ? "Acompanhamento da corrida conectado" : "Reconectando o acompanhamento da corrida"}</span></div>
      </main>
    </div>
  );
}

function JourneyAddress({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return <div className="min-w-0 border-b border-white/6 pb-2.5 last:border-b-0 last:pb-0"><p className={cn("break-words text-[10px] font-black uppercase tracking-[0.12em]", highlight ? "text-apois-yellow" : "text-zinc-500")}>{label}</p><p className="mt-1 break-words text-[12px] font-bold leading-4 text-zinc-100">{value || "Não informado"}</p></div>;
}

function DetailItem({ icon: Icon, label, value, highlight = false }: { icon: typeof MapPin; label: string; value: string; highlight?: boolean }) {
  return <div className="flex min-w-0 items-center gap-2.5 rounded-2xl border border-white/5 bg-black/25 px-3 py-2.5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-apois-yellow" aria-hidden="true"><Icon size={17} /></span><span className="min-w-0 flex-1"><span className="block break-words text-[10px] font-medium leading-4 text-zinc-500">{label}</span><span className={cn("mt-0.5 block break-words text-[12px] font-black leading-4", highlight ? "text-apois-yellow" : "text-white")}>{value}</span></span></div>;
}
