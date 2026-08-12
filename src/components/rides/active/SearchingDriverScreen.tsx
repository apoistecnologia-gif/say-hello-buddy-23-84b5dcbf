import { Car, Check, Clock3, CreditCard, MapPin, RefreshCw, ShieldCheck, X } from "lucide-react";
import { ActiveRideMap } from "@/components/map/ActiveRideMap";
import { cn, formatCurrency } from "@/lib/utils";
import type { ActiveRide } from "@/types/rides/active-ride";

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
  motos: "Moto",
  fretes: "Fretes e Mudanças",
  guincho: "Guincho",
  envios: "Envios",
};

type SearchingDriverScreenProps = {
  ride: ActiveRide;
  isRefreshing: boolean;
  isRealtimeConnected: boolean;
  canCancel: boolean;
  onRefresh: () => void;
  onCancel: () => void;
};

export function SearchingDriverScreen({
  ride,
  isRefreshing,
  isRealtimeConnected,
  canCancel,
  onRefresh,
  onCancel,
}: SearchingDriverScreenProps) {
  const paymentLabel = paymentLabels[ride.payment_method] || ride.payment_method;
  const categoryLabel = categoryLabels[ride.category] || ride.category;

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-black text-white">
      <header className="app-safe-top app-safe-x relative z-30 shrink-0 bg-black/96 pb-2 pt-2 backdrop-blur-xl">
        <div className="grid grid-cols-[44px_1fr_72px] items-center gap-2">
          <button
            type="button"
            onClick={canCancel ? onCancel : onRefresh}
            aria-label={canCancel ? "Cancelar corrida" : "Atualizar corrida"}
            className="app-pressable flex h-10 w-10 items-center justify-center rounded-full text-apois-yellow"
          >
            {canCancel ? <X size={25} strokeWidth={2.4} /> : <RefreshCw size={20} className={isRefreshing ? "animate-spin" : ""} />}
          </button>

          <div className="min-w-0 text-center">
            <h1 className="truncate text-[17px] font-black tracking-tight">Procurando motorista</h1>
            <p className="mt-0.5 truncate text-[10px] font-medium text-zinc-500">
              Estamos buscando o melhor motorista disponível para você.
            </p>
          </div>

          <div className="justify-self-end text-right">
            <p className="text-[17px] font-black tracking-[0.12em] text-white">APOIS</p>
            <p className="text-[7px] font-black uppercase tracking-[0.24em] text-apois-yellow">Vamos juntos</p>
          </div>
        </div>
      </header>

      <div className="relative min-h-[300px] flex-[0.95] overflow-hidden border-y border-white/5">
        <ActiveRideMap ride={ride} />

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-black/35" />

        <div className="pointer-events-none absolute left-4 top-4 z-20 max-w-[56%] rounded-2xl border border-white/10 bg-black/82 px-3 py-2.5 shadow-xl backdrop-blur-md">
          <div className="flex items-start gap-2.5">
            <MapPin className="mt-0.5 shrink-0 text-apois-yellow" size={19} fill="currentColor" />
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-apois-yellow">Embarque</p>
              <p className="mt-0.5 line-clamp-2 text-[12px] font-black leading-4 text-white">{ride.origin_name}</p>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-4 right-4 z-20 max-w-[56%] rounded-2xl border border-white/10 bg-black/82 px-3 py-2.5 shadow-xl backdrop-blur-md">
          <div className="flex items-start gap-2.5">
            <MapPin className="mt-0.5 shrink-0 text-white" size={18} />
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-500">Destino</p>
              <p className="mt-0.5 line-clamp-2 text-[12px] font-black leading-4 text-white">{ride.destination_name}</p>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
          <div className="absolute inset-[-38px] animate-ping rounded-full border border-apois-yellow/20" />
          <div className="absolute inset-[-22px] rounded-full border border-apois-yellow/30" />
          <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-apois-yellow bg-black/92 shadow-[0_0_34px_rgba(255,184,0,0.34)]">
            <img src="/favicon.png" alt="" aria-hidden="true" className="h-14 w-14 object-contain" />
          </div>
        </div>
      </div>

      <div className="app-safe-bottom min-h-0 flex-[1.05] overflow-y-auto bg-black px-3 pb-3 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="mx-auto max-w-[430px] space-y-2.5">
          <section className="rounded-2xl border border-white/10 bg-[#0e1014] p-3.5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-apois-yellow/25 bg-apois-yellow/10 text-apois-yellow">
                <Car size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-black text-white">Buscando motoristas próximos...</p>
                <p className="mt-0.5 text-[10px] font-medium text-zinc-500">Isso pode levar alguns segundos.</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div className="h-full w-3/5 animate-pulse rounded-full bg-apois-yellow" />
                </div>
              </div>
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="app-pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/8 bg-white/5 text-zinc-400 disabled:opacity-50"
                aria-label="Atualizar busca"
              >
                <RefreshCw size={15} className={isRefreshing ? "animate-spin" : ""} />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 divide-x divide-white/8 text-center">
              <SearchStage checked label="Solicitação enviada" />
              <SearchStage active label="Buscando motoristas" />
              <SearchStage label="Aguardando aceite" />
            </div>

            {!isRealtimeConnected ? (
              <p className="mt-3 rounded-xl border border-amber-400/15 bg-amber-400/5 px-3 py-2 text-center text-[9px] font-medium text-amber-200">
                Reconectando atualizações em tempo real. A busca continua no servidor.
              </p>
            ) : null}
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#0e1014] p-3.5">
            <h2 className="text-[13px] font-black text-white">Detalhes da corrida</h2>
            <div className="mt-2 overflow-hidden rounded-xl border border-white/7 bg-black/25">
              <DetailRow icon={<Car size={17} />} label="Categoria" value={categoryLabel} rightLabel="Preço estimado" rightValue={formatCurrency(ride.estimated_price)} />
              <DetailRow icon={<MapPin size={17} />} label="Distância" value={typeof ride.distance_km === "number" ? `${ride.distance_km.toFixed(1).replace(".", ",")} km` : "Calculada na rota"} rightLabel="Tempo estimado" rightValue={typeof ride.duration_min === "number" ? `${Math.max(1, Math.round(ride.duration_min))} min` : "Calculado na rota"} />
              <DetailRow icon={<CreditCard size={17} />} label="Forma de pagamento" value={paymentLabel} rightLabel="Código de segurança" rightValue="Após o aceite" last />
            </div>

            <div className="mt-2.5 flex items-start gap-3 rounded-xl border border-apois-yellow/20 bg-apois-yellow/[0.06] px-3 py-2.5">
              <ShieldCheck size={20} className="mt-0.5 shrink-0 text-apois-yellow" />
              <div>
                <p className="text-[11px] font-black text-apois-yellow">Sua segurança é prioridade</p>
                <p className="mt-0.5 text-[9px] leading-4 text-zinc-400">
                  O PIN só é liberado após um motorista aceitar a corrida e antes do início da viagem.
                </p>
              </div>
            </div>
          </section>

          {canCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="app-pressable min-h-11 w-full rounded-2xl border border-apois-yellow/30 bg-transparent text-[12px] font-black text-apois-yellow"
            >
              Cancelar corrida
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SearchStage({ checked = false, active = false, label }: { checked?: boolean; active?: boolean; label: string }) {
  return (
    <div className="px-2 py-1.5">
      <span
        className={cn(
          "mx-auto flex h-7 w-7 items-center justify-center rounded-full border",
          checked
            ? "border-apois-yellow bg-apois-yellow text-black"
            : active
              ? "border-apois-yellow/50 bg-apois-yellow/10 text-apois-yellow"
              : "border-white/10 bg-white/5 text-zinc-600",
        )}
      >
        {checked ? <Check size={14} strokeWidth={3} /> : active ? <Car size={14} /> : <Clock3 size={14} />}
      </span>
      <p className={cn("mt-1.5 text-[9px] font-bold leading-3", checked || active ? "text-zinc-200" : "text-zinc-600")}>{label}</p>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
  rightLabel,
  rightValue,
  last = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  rightLabel: string;
  rightValue: string;
  last?: boolean;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 px-3 py-2.5", !last && "border-b border-white/7")}>
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="text-apois-yellow">{icon}</span>
        <div className="min-w-0">
          <p className="text-[8px] font-bold uppercase tracking-wide text-zinc-600">{label}</p>
          <p className="mt-0.5 truncate text-[11px] font-black text-white">{value}</p>
        </div>
      </div>
      <div className="min-w-0 text-right">
        <p className="text-[8px] font-bold uppercase tracking-wide text-zinc-600">{rightLabel}</p>
        <p className="mt-0.5 truncate text-[11px] font-black text-apois-yellow">{rightValue}</p>
      </div>
    </div>
  );
}
