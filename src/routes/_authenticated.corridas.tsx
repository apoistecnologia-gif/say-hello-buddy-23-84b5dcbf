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
import { useDestination } from "@/hooks/use-destination";
import { useRideStops } from "@/hooks/rides/use-ride-stops";
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
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}

function formatRideDate(dateValue: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateValue));
}

function CorridasPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { setDestination } = useDestination();
  const { clearStops } = useRideStops();
  const [rides, setRides] = useState<RideHistoryItem[]>([]);
  const [filter, setFilter] = useState<RideHistoryFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    void loadRides();
  }, [loadRides]);

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

  const repeatRide = async (ride: RideHistoryItem): Promise<void> => {
    clearStops();
    setDestination({
      label: ride.destinationName,
      formattedAddress: ride.destinationName,
      latitude: ride.destination.lat,
      longitude: ride.destination.lng,
      placeId: `ride-history:${ride.id}:destination`,
    });
    await navigate({ to: "/inicio" });
  };

  return (
    <div className="app-screen min-h-[100dvh] bg-black text-white">
      <header className="sticky top-0 z-20 border-b border-white/8 bg-black/92 px-5 pb-4 pt-safe-area-inset-top backdrop-blur-xl">
        <div className="flex items-center justify-between pt-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-apois-yellow">
              Suas viagens
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-[-0.04em]">Histórico de corridas</h1>
          </div>
          <button
            type="button"
            aria-label="Atualizar histórico"
            onClick={() => void loadRides()}
            disabled={isLoading}
            className="app-pressable flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900 text-zinc-300 disabled:opacity-50"
          >
            <RefreshCw className={isLoading ? "animate-spin" : ""} size={18} />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-zinc-900/80 p-1.5">
          {filters.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
              className={cn(
                "app-pressable min-h-10 rounded-xl px-2 text-xs font-black transition-colors",
                filter === item.value
                  ? "bg-apois-yellow text-black"
                  : "text-zinc-500",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <main className="app-scroll space-y-7 px-5 pb-8 pt-5">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-44 animate-pulse rounded-3xl bg-zinc-900" />
            ))}
          </div>
        ) : error ? (
          <section className="rounded-3xl border border-red-500/20 bg-red-500/10 p-6 text-center">
            <XCircle className="mx-auto text-red-400" size={34} />
            <p className="mt-3 text-sm font-black text-white">Histórico indisponível</p>
            <p className="mt-2 text-xs leading-5 text-red-200/80">{error}</p>
            <button
              type="button"
              onClick={() => void loadRides()}
              className="app-pressable mt-4 min-h-11 rounded-xl bg-white px-5 text-xs font-black text-black"
            >
              Tentar novamente
            </button>
          </section>
        ) : groupedRides.length === 0 ? (
          <section className="rounded-3xl border border-white/8 bg-zinc-950 p-8 text-center">
            <CalendarDays className="mx-auto text-zinc-600" size={38} />
            <h2 className="mt-4 text-lg font-black">Nenhuma corrida encontrada</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              As corridas compatíveis com este filtro aparecerão aqui.
            </p>
          </section>
        ) : (
          groupedRides.map(([group, groupRides]) => (
            <section key={group}>
              <h2 className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                {group}
              </h2>
              <div className="space-y-3">
                {groupRides.map((ride) => {
                  const cancelled = isCancelled(ride);
                  const value = ride.finalPrice ?? ride.estimatedPrice;
                  return (
                    <article
                      key={ride.id}
                      className="rounded-3xl border border-white/8 bg-zinc-950 p-5 shadow-[0_16px_40px_rgba(0,0,0,0.24)]"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          void navigate({
                            to: "/corridas/$rideId",
                            params: { rideId: ride.id },
                          })
                        }
                        className="app-pressable w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-apois-yellow/10 text-apois-yellow">
                              <Car size={20} />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-white">
                                {categoryLabel(ride.category)}
                              </p>
                              <p className="mt-1 text-[11px] font-medium text-zinc-500">
                                {formatRideDate(ride.createdAt)}
                              </p>
                            </div>
                          </div>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-3 py-1 text-[10px] font-black",
                              ride.status === "finalizada"
                                ? "bg-apois-success/10 text-apois-success"
                                : cancelled
                                  ? "bg-red-500/10 text-red-400"
                                  : "bg-apois-yellow/10 text-apois-yellow",
                            )}
                          >
                            {statusLabel(ride)}
                          </span>
                        </div>

                        <div className="mt-5 grid grid-cols-[18px_1fr] gap-x-3 gap-y-4">
                          <span className="mt-1 h-2.5 w-2.5 rounded-full bg-apois-success" />
                          <p className="truncate text-sm font-bold text-zinc-300">{ride.originName}</p>
                          <MapPin className="-ml-1 text-apois-yellow" size={18} />
                          <p className="truncate text-sm font-bold text-white">{ride.destinationName}</p>
                        </div>

                        <div className="mt-5 flex items-end justify-between border-t border-white/8 pt-4">
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-zinc-600">
                              Pagamento
                            </p>
                            <p className="mt-1 text-xs font-bold text-zinc-400">
                              {paymentLabel(ride.paymentMethod)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-zinc-600">
                              {cancelled && value === 0 ? "Status" : "Valor"}
                            </p>
                            <p className="mt-1 text-lg font-black text-white">
                              {cancelled && value === 0 ? "—" : formatCurrency(value)}
                            </p>
                          </div>
                        </div>
                      </button>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => void repeatRide(ride)}
                          className="app-pressable flex min-h-11 items-center justify-center gap-2 rounded-xl bg-apois-yellow text-xs font-black text-black"
                        >
                          <RotateCcw size={15} />
                          Repetir corrida
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void navigate({
                              to: "/corridas/$rideId",
                              params: { rideId: ride.id },
                            })
                          }
                          className="app-pressable flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] text-xs font-black text-white"
                        >
                          Ver detalhes
                          <ChevronRight size={15} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
