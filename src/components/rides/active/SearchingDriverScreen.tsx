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
  carro: "Carro",
  motos: "Moto",
  moto: "Moto",
  fretes: "Fretes e Mudanças",
  frete: "Fretes e Mudanças",
  guincho: "Guincho",
  envios: "Envios",
  envio: "Envios",
};

type SearchingDriverScreenProps = {
  ride: ActiveRide;
  isRefreshing: boolean;
  isRealtimeConnected: boolean;
  canCancel: boolean;
  onRefresh: () => void;
  onCancel: () => void;
};

function safePositiveNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function SearchingDriverScreen({
  ride,
  isRefreshing,
  isRealtimeConnected,
  canCancel,
  onRefresh,
  onCancel,
}: SearchingDriverScreenProps) {
  const paymentKey = String(ride.payment_method ?? "").trim().toLowerCase();
  const categoryKey = String(ride.category ?? "").trim().toLowerCase();
  const paymentLabel = paymentLabels[paymentKey] || "Pagamento registrado";
  const categoryLabel = categoryLabels[categoryKey] || "Categoria de serviço";
  const estimatedPrice = safePositiveNumber(ride.estimated_price);
  const distanceKm = safePositiveNumber(ride.distance_km);
  const durationMin = safePositiveNumber(ride.duration_min);
  const origin = ride.origin_name?.trim() || "Origem selecionada";
  const destination = ride.destination_name?.trim() || "Destino selecionado";

  return (
    <div className="relative flex h-[100dvh] min-h-0 min-w-0 flex-col overflow-hidden bg-black text-white">
      <header className="app-safe-top app-safe-x relative z-30 shrink-0 bg-black/96 pb-2 pt-2 backdrop-blur-xl">
        <div className="grid min-w-0 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2 max-[359px]:grid-cols-[44px_minmax(0,1fr)]">
          <button
            type="button"
            onClick={canCancel ? onCancel : onRefresh}
            disabled={!canCancel && isRefreshing}
            aria-label={canCancel ? "Cancelar corrida" : isRefreshing ? "Atualizando corrida" : "Atualizar corrida"}
            aria-busy={!canCancel && isRefreshing}
            className="app-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-apois-yellow disabled:opacity-50"
          >
            {canCancel ? <X size={25} strokeWidth={2.4} aria-hidden="true" /> : <RefreshCw size={20} aria-hidden="true" className={isRefreshing ? "animate-spin motion-reduce:animate-none" : ""} />}
          </button>

          <div className="min-w-0 text-center">
            <h1 className="break-words text-[17px] font-black leading-5 tracking-tight">Procurando motorista</h1>
            <p className="mt-0.5 break-words text-[11px] font-medium leading-4 text-zinc-500">
              Estamos buscando um motorista disponível para você.
            </p>
          </div>

          <div className="max-w-[76px] justify-self-end text-right max-[359px]:hidden" aria-hidden="true">
            <p className="break-words text-[15px] font-black tracking-[0.08em] text-white sm:text-[17px] sm:tracking-[0.12em]">APOIS</p>
            <p className="break-words text-[10px] font-black uppercase leading-3 tracking-[0.12em] text-apois-yellow sm:tracking-[0.18em]">Vamos juntos</p>
          </div>
        </div>
      </header>

      <div className="relative min-h-[250px] flex-[0.95] overflow-hidden border-y border-white/5 max-h-[460px] max-[height:620px]:min-h-[210px] sm:min-h-[300px]">
        <ActiveRideMap ride={ride} />

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-black/35" />

        <div className="pointer-events-none absolute left-3 top-3 z-20 max-w-[68%] rounded-2xl border border-white/10 bg-black/82 px-3 py-2.5 shadow-xl backdrop-blur-md max-[339px]:right-3 max-[339px]:max-w-none sm:left-4 sm:top-4 sm:max-w-[56%]">
          <div className="flex min-w-0 items-start gap-2.5">
            <MapPin className="mt-0.5 shrink-0 text-apois-yellow" size={19} fill="currentColor" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-apois-yellow">Embarque</p>
              <p className="mt-0.5 break-words text-[12px] font-black leading-4 text-white">{origin}</p>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-3 right-3 z-20 max-w-[68%] rounded-2xl border border-white/10 bg-black/82 px-3 py-2.5 shadow-xl backdrop-blur-md max-[339px]:left-3 max-[339px]:max-w-none sm:bottom-4 sm:right-4 sm:max-w-[56%]">
          <div className="flex min-w-0 items-start gap-2.5">
            <MapPin className="mt-0.5 shrink-0 text-white" size={18} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">Destino</p>
              <p className="mt-0.5 break-words text-[12px] font-black leading-4 text-white">{destination}</p>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 max-[339px]:scale-90">
          <div className="absolute inset-[-38px] animate-ping rounded-full border border-apois-yellow/20 motion-reduce:animate-none" />
          <div className="absolute inset-[-22px] rounded-full border border-apois-yellow/30" />
          <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-apois-yellow bg-black/92 shadow-[0_0_34px_rgba(255,184,0,0.34)] sm:h-24 sm:w-24">
            <img src="/favicon.png" alt="" aria-hidden="true" className="h-12 w-12 object-contain sm:h-14 sm:w-14" />
          </div>
        </div>
      </div>

      <div className="app-safe-bottom min-h-0 min-w-0 flex-[1.05] overflow-y-auto overscroll-contain bg-black px-3 pb-3 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="mx-auto min-w-0 max-w-[430px] space-y-2.5">
          <section className="min-w-0 rounded-2xl border border-white/10 bg-[#0e1014] p-3.5 shadow-xl" aria-busy={isRefreshing}>
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-apois-yellow/25 bg-apois-yellow/10 text-apois-yellow" aria-hidden="true">
                <Car size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-[14px] font-black leading-5 text-white">Buscando motoristas próximos…</p>
                <p className="mt-0.5 break-words text-[11px] font-medium leading-4 text-zinc-500">A busca é atualizada automaticamente.</p>
                <div
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800"
                  role="progressbar"
                  aria-label="Busca de motorista em andamento"
                  aria-valuetext="Procurando motoristas disponíveis"
                >
                  <div className="h-full w-full origin-left animate-pulse rounded-full bg-gradient-to-r from-transparent via-apois-yellow to-transparent motion-reduce:animate-none" />
                </div>
              </div>
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="app-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/8 bg-white/5 text-zinc-400 disabled:opacity-50"
                aria-label={isRefreshing ? "Atualizando busca" : "Atualizar busca"}
                aria-busy={isRefreshing}
              >
                <RefreshCw size={15} aria-hidden="true" className={isRefreshing ? "animate-spin motion-reduce:animate-none" : ""} />
              </button>
            </div>

            <ol className="mt-3 grid grid-cols-3 divide-x divide-white/8 text-center max-[359px]:grid-cols-1 max-[359px]:divide-x-0 max-[359px]:divide-y" aria-label="Etapas da busca">
              <li><SearchStage checked label="Solicitação enviada" /></li>
              <li><SearchStage active label="Buscando motoristas" /></li>
              <li><SearchStage label="Aguardando aceite" /></li>
            </ol>

            {!isRealtimeConnected ? (
              <p className="mt-3 break-words rounded-xl border border-amber-400/15 bg-amber-400/5 px-3 py-2 text-center text-[11px] font-medium leading-4 text-amber-200" role="status" aria-live="polite">
                Tentando reconectar as atualizações da busca.
              </p>
            ) : null}
          </section>

          <section className="min-w-0 rounded-2xl border border-white/10 bg-[#0e1014] p-3.5">
            <h2 className="break-words text-[13px] font-black text-white">Detalhes da corrida</h2>
            <div className="mt-2 overflow-hidden rounded-xl border border-white/7 bg-black/25">
              <DetailRow icon={<Car size={17} />} label="Categoria" value={categoryLabel} rightLabel="Preço estimado" rightValue={estimatedPrice !== null ? formatCurrency(estimatedPrice) : "Calculando"} />
              <DetailRow icon={<MapPin size={17} />} label="Distância" value={distanceKm !== null ? `${distanceKm.toFixed(1).replace(".", ",")} km` : "Calculando rota"} rightLabel="Tempo estimado" rightValue={durationMin !== null ? `${Math.max(1, Math.round(durationMin))} min` : "Calculando rota"} />
              <DetailRow icon={<CreditCard size={17} />} label="Forma de pagamento" value={paymentLabel} rightLabel="Código de segurança" rightValue="Após o aceite" last />
            </div>

            <div className="mt-2.5 flex min-w-0 items-start gap-3 rounded-xl border border-apois-yellow/20 bg-apois-yellow/[0.06] px-3 py-2.5">
              <ShieldCheck size={20} className="mt-0.5 shrink-0 text-apois-yellow" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="break-words text-[11px] font-black text-apois-yellow">Sua segurança é prioridade</p>
                <p className="mt-0.5 break-words text-[11px] leading-4 text-zinc-400">
                  O PIN só é liberado após um motorista aceitar a corrida e antes do início da viagem.
                </p>
              </div>
            </div>
          </section>

          {canCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="app-pressable min-h-11 w-full rounded-2xl border border-apois-yellow/30 bg-transparent px-4 py-2 text-center text-[12px] font-black text-apois-yellow"
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
  const stateLabel = checked ? "Concluída" : active ? "Em andamento" : "Aguardando";
  return (
    <div className="min-w-0 px-2 py-2" aria-label={`${label}: ${stateLabel}`}>
      <span
        className={cn(
          "mx-auto flex h-7 w-7 items-center justify-center rounded-full border",
          checked
            ? "border-apois-yellow bg-apois-yellow text-black"
            : active
              ? "border-apois-yellow/50 bg-apois-yellow/10 text-apois-yellow"
              : "border-white/10 bg-white/5 text-zinc-600",
        )}
        aria-hidden="true"
      >
        {checked ? <Check size={14} strokeWidth={3} /> : active ? <Car size={14} /> : <Clock3 size={14} />}
      </span>
      <p className={cn("mt-1.5 break-words text-[10px] font-bold leading-4", checked || active ? "text-zinc-200" : "text-zinc-600")}>{label}</p>
      <span className="sr-only">{stateLabel}</span>
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
    <div className={cn("grid min-w-0 grid-cols-2 gap-3 px-3 py-2.5 max-[359px]:grid-cols-1", !last && "border-b border-white/7")}>
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="shrink-0 text-apois-yellow" aria-hidden="true">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-[10px] font-bold uppercase tracking-wide text-zinc-600">{label}</p>
          <p className="mt-0.5 break-words text-[11px] font-black leading-4 text-white">{value}</p>
        </div>
      </div>
      <div className="min-w-0 text-right max-[359px]:pl-[27px] max-[359px]:text-left">
        <p className="break-words text-[10px] font-bold uppercase tracking-wide text-zinc-600">{rightLabel}</p>
        <p className="mt-0.5 break-words text-[11px] font-black leading-4 text-apois-yellow">{rightValue}</p>
      </div>
    </div>
  );
}
