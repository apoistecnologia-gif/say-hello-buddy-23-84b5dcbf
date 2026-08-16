import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  Car,
  ChevronRight,
  MapPin,
  RefreshCw,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useRepeatRide } from "@/hooks/rides/use-repeat-ride";
import { rideHistoryService } from "@/services/rides/ride-history-service";
import type { RideHistoryFilter, RideHistoryItem } from "@/types/rides/ride-history";
import { cn, formatCurrency } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/corridas")({
  component: CorridasPage,
});

const filters: Array<{ value: RideHistoryFilter; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "completed", label: "Concluídas" },
  { value: "cancelled", label: "Canceladas" },
];

function isCancelled(ride: RideHistoryItem): boolean {
  return ["cancelada_passageiro", "cancelada_motorista", "expired"].includes(ride.status);
}

function statusLabel(ride: RideHistoryItem): string {
  switch (ride.status) {
    case "finalizada": return "Concluída";
    case "cancelada_passageiro": return "Cancelada por você";
    case "cancelada_motorista": return "Cancelada pelo motorista";
    case "expired": return "Busca encerrada";
    case "agendada": return "Agendada";
    case "aguardando_pagamento": return "Aguardando pagamento Pix";
    case "procurar_motorista": return "Procurando motorista";
    case "motorista_a_caminho": return "Motorista a caminho";
    case "motorista_chegou": return "Motorista chegou";
    case "em_viagem": return "Em viagem";
    default: return "Corrida registrada";
  }
}

function categoryLabel(category: string): string {
  const labels: Record<string, string> = { carros: "Carro", carro: "Carro", motos: "Moto", moto: "Moto", fretes: "Fretes e Mudanças", guincho: "Guincho", envios: "Envios" };
  return labels[category] ?? "Categoria de serviço";
}

function paymentLabel(paymentMethod: string): string {
  const labels: Record<string, string> = { pix: "PIX", credit: "Cartão de crédito", credit_card: "Cartão de crédito", debit: "Cartão de débito", debit_card: "Cartão de débito", cash: "Dinheiro", money: "Dinheiro", wallet: "Carteira APOIS" };
  return labels[paymentMethod] ?? "Pagamento registrado";
}

function dateGroup(dateValue: string): string {
  const date = new Date(dateValue);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const differenceDays = Math.round((today - target) / 86_400_000);
  if (differenceDays === 0) return "Hoje";
  if (differenceDays === 1) return "Ontem";
  if (differenceDays > 1 && differenceDays < 7) return "Esta semana";
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}

function formatRideDate(dateValue: string): string {
  const date = new Date(dateValue);
  if (!Number.isFinite(date.getTime())) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function CorridasPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const repeatRide = useRepeatRide();
  const [rides, setRides] = useState<RideHistoryItem[]>([]);
  const [filter, setFilter] = useState<RideHistoryFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repeatingRideId, setRepeatingRideId] = useState<string | null>(null);

  const loadRides = useCallback(async () => {
    if (!profile?.id) return;
    setIsLoading(true);
    setError(null);
    try {
      setRides(await rideHistoryService.list(profile.id));
    } catch (caughtError: unknown) {
      console.error("[CorridasPage] History load failed", caughtError);
      setError("Não foi possível carregar seu histórico agora.");
    } finally {
      setIsLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => { void loadRides(); }, [loadRides]);

  const filteredRides = useMemo(() => {
    if (filter === "completed") return rides.filter((ride) => ride.status === "finalizada");
    if (filter === "cancelled") return rides.filter(isCancelled);
    return rides;
  }, [filter, rides]);

  const groupedRides = useMemo(() => {
    const groups = new Map<string, RideHistoryItem[]>();
    filteredRides.forEach((ride) => {
      const group = dateGroup(ride.createdAt);
      groups.set(group, [...(groups.get(group) ?? []), ride]);
    });
    return Array.from(groups.entries());
  }, [filteredRides]);

  const handleRepeatRide = async (ride: RideHistoryItem): Promise<void> => {
    if (repeatingRideId) return;
    setRepeatingRideId(ride.id);
    try {
      await repeatRide(ride);
    } finally {
      setRepeatingRideId(null);
    }
  };

  return (
    <div className="app-screen min-h-[100dvh] min-w-0 bg-black text-white">
      <header className="sticky top-0 z-20 border-b border-white/8 bg-black/92 px-4 pb-4 pt-safe-area-inset-top backdrop-blur-xl sm:px-5">
        <div className="flex min-w-0 items-center justify-between gap-3 pt-5">
          <div className="min-w-0 flex-1">
            <p className="break-words text-[10px] font-black uppercase tracking-[0.18em] text-apois-yellow sm:tracking-[0.22em]">Suas viagens</p>
            <h1 className="mt-1 break-words text-2xl font-black tracking-[-0.04em]">Histórico de corridas</h1>
          </div>
          <button type="button" aria-label={isLoading ? "Atualizando histórico" : "Atualizar histórico"} aria-busy={isLoading} onClick={() => void loadRides()} disabled={isLoading} className="app-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900 text-zinc-300 disabled:opacity-50">
            <RefreshCw className={isLoading ? "animate-spin" : ""} size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-zinc-900/80 p-1.5 max-[359px]:grid-cols-1" role="tablist" aria-label="Filtrar histórico">
          {filters.map((item) => (
            <button key={item.value} type="button" role="tab" aria-selected={filter === item.value} onClick={() => setFilter(item.value)} className={cn("app-pressable min-h-11 rounded-xl px-2 py-2 text-xs font-black transition-colors", filter === item.value ? "bg-apois-yellow text-black" : "text-zinc-500")}>{item.label}</button>
          ))}
        </div>
      </header>

      <main className="app-scroll min-w-0 space-y-7 px-4 pb-8 pt-5 sm:px-5">
        {isLoading ? (
          <div className="space-y-3" role="status" aria-label="Carregando histórico">{[1, 2, 3].map((item) => <div key={item} className="h-44 animate-pulse rounded-3xl bg-zinc-900" />)}</div>
        ) : error ? (
          <section role="alert" className="min-w-0 rounded-3xl border border-red-500/20 bg-red-500/10 p-6 text-center"><XCircle className="mx-auto text-red-400" size={34} aria-hidden="true" /><p className="mt-3 break-words text-sm font-black text-white">Histórico indisponível</p><p className="mt-2 break-words text-xs leading-5 text-red-200/80">{error}</p><button type="button" onClick={() => void loadRides()} className="app-pressable mt-4 min-h-11 rounded-xl bg-white px-5 py-2 text-xs font-black text-black">Tentar novamente</button></section>
        ) : groupedRides.length === 0 ? (
          <section className="min-w-0 rounded-3xl border border-white/8 bg-zinc-950 p-8 text-center" role="status"><CalendarDays className="mx-auto text-zinc-600" size={38} aria-hidden="true" /><h2 className="mt-4 break-words text-lg font-black">Nenhuma corrida encontrada</h2><p className="mt-2 break-words text-sm leading-6 text-zinc-500">As corridas compatíveis com este filtro aparecerão aqui.</p></section>
        ) : groupedRides.map(([group, groupRides]) => (
          <section key={group} className="min-w-0">
            <h2 className="mb-3 break-words text-xs font-black uppercase tracking-[0.18em] text-zinc-500">{group}</h2>
            <div className="space-y-3">
              {groupRides.map((ride) => {
                const cancelled = isCancelled(ride);
                const value = ride.finalPrice ?? ride.estimatedPrice;
                const isRepeating = repeatingRideId === ride.id;
                return (
                  <article key={ride.id} className="min-w-0 rounded-3xl border border-white/8 bg-zinc-950 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.24)] sm:p-5">
                    <button type="button" onClick={() => void navigate({ to: "/corridas/$rideId", params: { rideId: ride.id } })} className="app-pressable w-full min-w-0 rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apois-yellow">
                      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-[170px] flex-1 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-apois-yellow/10 text-apois-yellow" aria-hidden="true"><Car size={20} /></div><div className="min-w-0 flex-1"><p className="break-words text-sm font-black text-white">{categoryLabel(ride.category)}</p><p className="mt-1 break-words text-[11px] font-medium leading-4 text-zinc-500">{formatRideDate(ride.createdAt)}</p></div></div>
                        <span className={cn("max-w-full rounded-full px-3 py-1 text-center text-[10px] font-black leading-4", ride.status === "finalizada" ? "bg-apois-success/10 text-apois-success" : cancelled ? "bg-red-500/10 text-red-400" : "bg-apois-yellow/10 text-apois-yellow")}>{statusLabel(ride)}</span>
                      </div>
                      <div className="mt-5 grid min-w-0 grid-cols-[18px_minmax(0,1fr)] gap-x-3 gap-y-4"><span className="mt-1 h-2.5 w-2.5 rounded-full bg-apois-success" aria-hidden="true" /><p className="break-words text-sm font-bold leading-5 text-zinc-300">{ride.originName}</p><MapPin className="-ml-1 shrink-0 text-apois-yellow" size={18} aria-hidden="true" /><p className="break-words text-sm font-bold leading-5 text-white">{ride.destinationName}</p></div>
                      <div className="mt-5 flex min-w-0 flex-wrap items-end justify-between gap-3 border-t border-white/8 pt-4"><div className="min-w-[150px] flex-1"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600">Pagamento</p><p className="mt-1 break-words text-xs font-bold leading-5 text-zinc-400">{paymentLabel(ride.paymentMethod)}</p></div><div className="min-w-0 text-right max-[359px]:w-full max-[359px]:text-left"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600">{cancelled && value === 0 ? "Status" : "Valor"}</p><p className="mt-1 max-w-full break-words text-lg font-black tabular-nums text-white">{cancelled && value === 0 ? "—" : formatCurrency(value)}</p></div></div>
                    </button>
                    <div className="mt-4 grid grid-cols-2 gap-2 max-[359px]:grid-cols-1">
                      <button type="button" onClick={() => void handleRepeatRide(ride)} disabled={Boolean(repeatingRideId)} aria-busy={isRepeating} className="app-pressable flex min-h-11 items-center justify-center gap-2 rounded-xl bg-apois-yellow px-3 py-2 text-center text-xs font-black leading-5 text-black disabled:opacity-60"><RotateCcw className={`shrink-0 ${isRepeating ? "animate-spin" : ""}`} size={15} aria-hidden="true" />{isRepeating ? "Preparando..." : "Repetir corrida"}</button>
                      <button type="button" onClick={() => void navigate({ to: "/corridas/$rideId", params: { rideId: ride.id } })} className="app-pressable flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-center text-xs font-black leading-5 text-white">Ver detalhes<ChevronRight size={15} className="shrink-0" aria-hidden="true" /></button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
