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
import type {
  RideHistoryFilter,
  RideHistoryItem,
} from "@/types/rides/ride-history";
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
    case "finalizada":
      return "Concluída";
    case "cancelada_passageiro":
      return "Cancelada por você";
    case "cancelada_motorista":
      return "Cancelada pelo motorista";
    case "expired":
      return "Expirada";
    case "agendada":
      return "Agendada";
    case "aguardando_pagamento":
      return "Aguardando pagamento Pix";
    case "procurar_motorista":
      return "Procurando motorista";
    case "motorista_a_caminho":
      return "Motorista a caminho";
    case "motorista_chegou":
      return "Motorista chegou";
    case "em_viagem":
      return "Em viagem";
  }
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

function dateGroup(dateValue: string): string {
  const date = new Date(dateValue);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const differenceDays = Math.round((today - target) / 86_400_000);

  if (differenceDays === 0) return "Hoje";
  if (differenceDays === 1) return "Ontem";
  if (differenceDays > 1 && differenceDays < 7) return "Esta semana";
  if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) {
    return "Este mês";
  }
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}

function formatDate(dateValue: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateValue));
}

function CorridasPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { repeatRide, isLoading: isRepeating } = useRepeatRide();
  const [filter, setFilter] = useState<RideHistoryFilter>("all");
  const [rides, setRides] = useState<RideHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRides = useCallback(
    async (refresh = false) => {
      if (!user?.id) return;
      if (refresh) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);
      try {
        const data = await rideHistoryService.list(user.id, filter);
        setRides(data);
      } catch (caughtError) {
        console.error("[Corridas] Failed to load history", caughtError);
        setError("Não foi possível carregar suas corridas agora.");
      } finally {
        if (refresh) setIsRefreshing(false);
        else setIsLoading(false);
      }
    },
    [filter, user?.id],
  );

  useEffect(() => {
    void loadRides(false);
  }, [loadRides]);

  const groups = useMemo(() => {
    const result: Array<{ label: string; rides: RideHistoryItem[] }> = [];
    for (const ride of rides) {
      const label = dateGroup(ride.created_at);
      const existing = result.find((group) => group.label === label);
      if (existing) existing.rides.push(ride);
      else result.push({ label, rides: [ride] });
    }
    return result;
  }, [rides]);

  const handleRepeatRide = async (ride: RideHistoryItem) => {
    try {
      await repeatRide(ride);
    } catch (caughtError) {
      console.error("[Corridas] Repeat ride failed", caughtError);
    }
  };

  return (
    <div className="app-screen bg-black text-white">
      <header className="app-safe-top app-safe-x shrink-0 border-b border-white/5 bg-black pb-4 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-apois-yellow">APOIS</p>
            <h1 className="mt-1 text-2xl font-black">Suas corridas</h1>
          </div>
          <button
            type="button"
            onClick={() => void loadRides(true)}
            disabled={isRefreshing}
            className="app-pressable flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-zinc-300 disabled:opacity-50"
            aria-label="Atualizar corridas"
          >
            <RefreshCw size={18} className={isRefreshing ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {filters.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
              className={cn(
                "app-pressable shrink-0 rounded-full border px-4 py-2 text-xs font-black",
                filter === item.value
                  ? "border-apois-yellow bg-apois-yellow text-black"
                  : "border-white/10 bg-white/[0.03] text-zinc-400",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <main className="app-scroll flex-1 px-4 py-4">
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-40 animate-pulse rounded-3xl bg-zinc-900" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-red-400/20 bg-red-400/5 p-5 text-center">
            <XCircle className="mx-auto text-red-300" size={28} />
            <p className="mt-3 text-sm font-bold text-red-200">{error}</p>
            <button
              type="button"
              onClick={() => void loadRides(false)}
              className="app-pressable mt-4 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-white px-4 text-xs font-black text-black"
            >
              <RefreshCw size={15} />
              Tentar novamente
            </button>
          </div>
        ) : rides.length === 0 ? (
          <div className="flex min-h-[55vh] flex-col items-center justify-center text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/8 bg-zinc-900">
              <Car size={36} className="text-zinc-600" />
            </div>
            <h2 className="mt-5 text-lg font-black">Nenhuma corrida aqui</h2>
            <p className="mt-2 max-w-xs text-sm leading-5 text-zinc-500">
              {filter === "all"
                ? "Suas corridas aparecerão aqui assim que você solicitar a primeira."
                : "Não encontramos corridas neste filtro."}
            </p>
            <button
              type="button"
              onClick={() => void navigate({ to: "/inicio" })}
              className="app-pressable mt-5 rounded-2xl bg-apois-yellow px-5 py-3 text-sm font-black text-black"
            >
              Solicitar corrida
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.label}>
                <div className="mb-2 flex items-center gap-2 px-1">
                  <CalendarDays size={14} className="text-apois-yellow" />
                  <h2 className="text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">
                    {group.label}
                  </h2>
                </div>

                <div className="space-y-3">
                  {group.rides.map((ride) => (
                    <article key={ride.id} className="rounded-3xl border border-white/8 bg-[#0e1014] p-4">
                      <button
                        type="button"
                        onClick={() =>
                          void navigate({ to: "/corridas/$rideId", params: { rideId: ride.id } })
                        }
                        className="app-pressable w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-black text-white">{statusLabel(ride)}</p>
                            <p className="mt-1 text-[10px] text-zinc-500">{formatDate(ride.created_at)}</p>
                          </div>
                          <ChevronRight size={17} className="mt-1 shrink-0 text-zinc-600" />
                        </div>

                        <div className="mt-4 space-y-3">
                          <div className="flex gap-3">
                            <MapPin size={15} className="mt-0.5 shrink-0 text-apois-yellow" />
                            <div className="min-w-0">
                              <p className="text-[9px] font-black uppercase tracking-[0.12em] text-zinc-600">Origem</p>
                              <p className="mt-1 truncate text-xs font-bold text-zinc-300">{ride.origin_name}</p>
                            </div>
                          </div>
                          <div className="flex gap-3">
                            <MapPin size={15} className="mt-0.5 shrink-0 text-zinc-500" />
                            <div className="min-w-0">
                              <p className="text-[9px] font-black uppercase tracking-[0.12em] text-zinc-600">Destino</p>
                              <p className="mt-1 truncate text-xs font-bold text-zinc-300">{ride.destination_name}</p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/6 pt-3 text-center">
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.1em] text-zinc-600">Categoria</p>
                            <p className="mt-1 text-[11px] font-bold text-zinc-300">{categoryLabel(ride.category)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.1em] text-zinc-600">Pagamento</p>
                            <p className="mt-1 text-[11px] font-bold text-zinc-300">{paymentLabel(ride.payment_method)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.1em] text-zinc-600">Valor</p>
                            <p className="mt-1 text-[11px] font-black text-apois-yellow">
                              {formatCurrency(ride.final_price ?? ride.estimated_price)}
                            </p>
                          </div>
                        </div>
                      </button>

                      {isCancelled(ride) || ride.status === "finalizada" ? (
                        <button
                          type="button"
                          disabled={isRepeating}
                          onClick={() => void handleRepeatRide(ride)}
                          className="app-pressable mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] text-xs font-black text-zinc-300 disabled:opacity-50"
                        >
                          <RotateCcw size={15} />
                          Solicitar novamente
                        </button>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}