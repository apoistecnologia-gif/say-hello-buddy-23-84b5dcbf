import type { RideStatus } from "@/types/rides/active-ride";
import { CheckCircle2, MapPin, Navigation, Search, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface RideStatusHeaderProps {
  status: RideStatus;
  isRefreshing?: boolean | undefined;
  driverDistanceMeters?: number | null | undefined;
  estimatedArrivalMinutes?: number | null | undefined;
  isQueuedRide?: boolean | undefined;
}

function formatDistance(distanceMeters: number): string {
  if (distanceMeters < 1000) return `${Math.max(50, Math.round(distanceMeters / 50) * 50)} m`;
  return `${(distanceMeters / 1000).toFixed(distanceMeters < 10_000 ? 1 : 0).replace(".", ",")} km`;
}

export function RideStatusHeader({
  status,
  isRefreshing,
  driverDistanceMeters,
  estimatedArrivalMinutes,
  isQueuedRide = false,
}: RideStatusHeaderProps) {
  const hasRealDistance =
    typeof driverDistanceMeters === "number" &&
    Number.isFinite(driverDistanceMeters) &&
    driverDistanceMeters >= 0;
  const hasRealArrival =
    typeof estimatedArrivalMinutes === "number" &&
    Number.isFinite(estimatedArrivalMinutes) &&
    estimatedArrivalMinutes > 0;

  const getStatusConfig = () => {
    switch (status) {
      case "procurar_motorista":
        if (isQueuedRide) {
          return {
            title: "Motorista reservado",
            subtitle: "Ele está concluindo uma corrida próxima. Depois seguirá para o seu embarque.",
            icon: <Navigation className="text-apois-yellow" size={18} />,
            color: "border-apois-yellow/25 bg-black/88",
          };
        }
        return {
          title: "Procurando motorista",
          subtitle: "Enviando a solicitação aos motoristas disponíveis.",
          icon: <Search className="animate-pulse text-apois-yellow" size={18} />,
          color: "border-apois-yellow/25 bg-black/88",
        };
      case "motorista_a_caminho":
        return {
          title: hasRealArrival
            ? `Chegada estimada em ${Math.max(1, Math.round(estimatedArrivalMinutes))} min`
            : "Motorista a caminho",
          subtitle: hasRealDistance
            ? `Aproximadamente ${formatDistance(driverDistanceMeters)} do embarque`
            : "A localização real do motorista aparece no mapa.",
          icon: <Navigation className="text-apois-yellow" size={18} />,
          color: "border-apois-yellow/25 bg-black/90",
        };
      case "motorista_chegou":
        return {
          title: "O motorista chegou",
          subtitle: "Confira o veículo e informe o PIN somente no embarque.",
          icon: <MapPin className="text-green-400" size={18} />,
          color: "border-green-500/25 bg-black/90",
        };
      case "em_viagem":
        return {
          title: "Em viagem",
          subtitle: "Acompanhe o trajeto no mapa.",
          icon: <Navigation className="text-apois-yellow" size={18} />,
          color: "border-apois-yellow/20 bg-black/90",
        };
      case "finalizada":
        return {
          title: "Viagem concluída",
          subtitle: "Confira o valor final e avalie o motorista.",
          icon: <CheckCircle2 className="text-green-400" size={18} />,
          color: "border-green-500/25 bg-black/90",
        };
      case "cancelada_passageiro":
      case "cancelada_motorista":
        return {
          title: "Viagem cancelada",
          subtitle:
            status === "cancelada_motorista" ? "Cancelada pelo motorista" : "Cancelada por você",
          icon: <XCircle className="text-red-400" size={18} />,
          color: "border-red-500/25 bg-black/90",
        };
      case "expired":
        return {
          title: "Nenhum motorista disponível",
          subtitle: "A busca terminou. Você pode voltar e solicitar novamente.",
          icon: <Search className="text-zinc-400" size={18} />,
          color: "border-white/10 bg-black/90",
        };
      case "agendada":
        return {
          title: "Corrida agendada",
          subtitle: "A busca por motorista começará no horário programado.",
          icon: <MapPin className="text-apois-yellow" size={18} />,
          color: "border-apois-yellow/25 bg-black/88",
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div
      className={cn(
        "flex min-w-0 items-start gap-2.5 overflow-hidden rounded-2xl border px-3 py-2.5 shadow-[0_12px_32px_-22px_rgba(0,0,0,1)] backdrop-blur-xl transition-all duration-500",
        config.color,
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/5 bg-zinc-900/90">
        {config.icon}
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <h3 className="truncate text-[14px] font-black leading-4 text-white">{config.title}</h3>
        <p className="mt-0.5 line-clamp-2 break-words text-[10px] font-medium leading-[14px] text-zinc-400">
          {config.subtitle}
        </p>
      </div>
      {isRefreshing ? <div className="mt-1.5 h-2 w-2 shrink-0 animate-ping rounded-full bg-apois-yellow" /> : null}
    </div>
  );
}
