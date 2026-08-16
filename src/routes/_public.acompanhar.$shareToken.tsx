import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Car,
  CheckCircle2,
  Clock3,
  Loader2,
  LockKeyhole,
  MapPin,
  Navigation,
  RefreshCw,
  Route as RouteIcon,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import {
  sharedRideService,
  type SharedRideSnapshot,
  type SharedRideStatus,
} from "@/services/rides/shared-ride-service";

export const Route = createFileRoute("/_public/acompanhar/$shareToken")({
  component: SharedRidePage,
});

const ACTIVE_STATUSES = new Set<SharedRideStatus>([
  "procurar_motorista",
  "motorista_a_caminho",
  "motorista_chegou",
  "em_viagem",
]);

function statusContent(status: SharedRideStatus): {
  title: string;
  description: string;
  className: string;
  icon: typeof Clock3;
} {
  const values: Record<SharedRideStatus, ReturnType<typeof statusContent>> = {
    procurar_motorista: {
      title: "Procurando motorista",
      description: "A solicitação foi enviada e está buscando um motorista disponível.",
      className: "border-apois-yellow/20 bg-apois-yellow/10 text-apois-yellow",
      icon: Clock3,
    },
    motorista_a_caminho: {
      title: "Motorista a caminho",
      description: "O motorista está se deslocando até o ponto de embarque.",
      className: "border-apois-yellow/20 bg-apois-yellow/10 text-apois-yellow",
      icon: Navigation,
    },
    motorista_chegou: {
      title: "Motorista chegou",
      description: "O veículo já está no ponto de embarque.",
      className: "border-apois-success/20 bg-apois-success/10 text-apois-success",
      icon: MapPin,
    },
    em_viagem: {
      title: "Corrida em andamento",
      description: "O passageiro está seguindo para o destino informado.",
      className: "border-apois-yellow/20 bg-apois-yellow/10 text-apois-yellow",
      icon: RouteIcon,
    },
    finalizada: {
      title: "Corrida finalizada",
      description: "A viagem chegou ao destino e foi encerrada.",
      className: "border-apois-success/20 bg-apois-success/10 text-apois-success",
      icon: CheckCircle2,
    },
    cancelada_passageiro: {
      title: "Corrida cancelada",
      description: "A solicitação foi cancelada pelo passageiro.",
      className: "border-red-500/20 bg-red-500/10 text-red-400",
      icon: XCircle,
    },
    cancelada_motorista: {
      title: "Corrida cancelada",
      description: "A solicitação foi cancelada pelo motorista.",
      className: "border-red-500/20 bg-red-500/10 text-red-400",
      icon: XCircle,
    },
  };
  return values[status];
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Atualização indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
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

function SharedRidePage() {
  const { shareToken } = Route.useParams();
  const [ride, setRide] = useState<SharedRideSnapshot | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not_found" | "failed">("loading");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadRide = useCallback(
    async (background = false): Promise<void> => {
      if (background) setIsRefreshing(true);
      else setState("loading");

      try {
        const snapshot = await sharedRideService.getByToken(shareToken);
        setRide(snapshot);
        setState("ready");
      } catch (caughtError: unknown) {
        const message = caughtError instanceof Error ? caughtError.message : "shared_ride_unavailable";
        if (message === "shared_ride_not_found") setState("not_found");
        else setState("failed");
      } finally {
        setIsRefreshing(false);
      }
    },
    [shareToken],
  );

  useEffect(() => {
    void loadRide();
  }, [loadRide]);

  useEffect(() => {
    if (!ride || !ACTIVE_STATUSES.has(ride.status)) return;
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void loadRide(true);
      }
    }, 12_000);
    return () => window.clearInterval(intervalId);
  }, [loadRide, ride]);

  const status = useMemo(() => (ride ? statusContent(ride.status) : null), [ride]);

  if (state === "loading") {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-black p-6 text-white">
        <div className="text-center">
          <Loader2 className="mx-auto animate-spin text-apois-yellow" size={38} />
          <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
            Carregando acompanhamento
          </p>
        </div>
      </div>
    );
  }

  if (state === "not_found" || state === "failed" || !ride || !status) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-black p-6 text-center text-white">
        <section className="w-full max-w-sm rounded-[30px] border border-white/8 bg-zinc-950 p-6">
          <LockKeyhole className="mx-auto text-zinc-600" size={42} />
          <h1 className="mt-4 text-xl font-black">
            {state === "not_found" ? "Acompanhamento encerrado" : "Acompanhamento indisponível"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            {state === "not_found"
              ? "Este link não existe, expirou ou a corrida não está mais disponível para acompanhamento."
              : "Não foi possível consultar a corrida agora. Verifique sua conexão e tente novamente."}
          </p>
          {state === "failed" ? (
            <button
              type="button"
              onClick={() => void loadRide()}
              className="app-pressable mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-apois-yellow text-sm font-black text-black"
            >
              <RefreshCw size={17} />
              Tentar novamente
            </button>
          ) : null}
        </section>
      </div>
    );
  }

  const StatusIcon = status.icon;
  const vehicle = [ride.driverVehicleModel, ride.driverVehicleColor].filter(Boolean).join(" • ");

  return (
    <div className="min-h-[100dvh] bg-black px-5 pb-8 pt-safe-area-inset-top text-white">
      <main className="mx-auto max-w-md pt-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-3xl font-black tracking-[-0.06em] text-apois-yellow">APOIS</p>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">
              Acompanhamento protegido
            </p>
          </div>
          <button
            type="button"
            aria-label="Atualizar acompanhamento"
            onClick={() => void loadRide(true)}
            disabled={isRefreshing}
            className="app-pressable flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900 disabled:opacity-50"
          >
            <RefreshCw className={isRefreshing ? "animate-spin" : ""} size={18} />
          </button>
        </header>

        <section className={`mt-6 rounded-[30px] border p-5 ${status.className}`}>
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-black/20">
              <StatusIcon size={23} />
            </div>
            <div>
              <h1 className="text-lg font-black text-white">{status.title}</h1>
              <p className="mt-1 text-xs leading-5 text-zinc-300/80">{status.description}</p>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-[30px] border border-white/8 bg-zinc-950 p-5">
          <div className="grid grid-cols-[18px_1fr] gap-x-3 gap-y-6">
            <span className="mt-1 h-3 w-3 rounded-full bg-apois-success" />
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-600">Origem</p>
              <p className="mt-1 text-sm font-bold text-zinc-200">{ride.originName}</p>
            </div>
            <MapPin className="-ml-1 text-apois-yellow" size={20} />
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-600">Destino</p>
              <p className="mt-1 text-sm font-black text-white">{ride.destinationName}</p>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-[30px] border border-white/8 bg-zinc-950 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-900 text-apois-yellow">
              <Car size={21} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-600">Motorista e veículo</p>
              <p className="mt-1 truncate text-sm font-black text-white">
                {ride.driverName ?? "Motorista ainda não definido"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {vehicle || categoryLabel(ride.category)}
              </p>
              {ride.driverVehiclePlate ? (
                <p className="mt-2 inline-flex rounded-lg bg-white px-2.5 py-1 text-xs font-black uppercase tracking-[0.14em] text-black">
                  {ride.driverVehiclePlate}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 shrink-0 text-apois-success" size={19} />
            <div>
              <p className="text-xs font-black text-zinc-300">Privacidade protegida</p>
              <p className="mt-1 text-xs leading-5 text-zinc-600">
                Este acompanhamento não mostra nome, telefone, código de segurança ou dados de pagamento do passageiro.
              </p>
            </div>
          </div>
        </section>

        <p className="mt-5 text-center text-[10px] font-bold text-zinc-700">
          Última atualização: {formatDate(ride.updatedAt)}
        </p>
      </main>
    </div>
  );
}
