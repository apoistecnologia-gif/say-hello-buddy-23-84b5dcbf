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
            subtitle: "Ele está concluindo uma corrida próxima. Assim que finalizar, seguirá para o seu embarque.",
            icon: <Navigation className="text-apois-yellow" size={20} />,
            color: "bg-apois-yellow/10 border-apois-yellow/20",
          };
        }
        return {
          title: "Procurando motorista",
          subtitle: "A solicitação está sendo enviada aos motoristas disponíveis.",
          icon: <Search className="animate-pulse text-apois-yellow" size={20} />,
          color: "bg-apois-yellow/10 border-apois-yellow/20",
        };
      case "motorista_a_caminho":
        return {
          title: hasRealArrival
            ? `Chegada estimada em ${Math.max(1, Math.round(estimatedArrivalMinutes))} min`
            : "Motorista a caminho",
          subtitle: hasRealDistance
            ? `Aproximadamente ${formatDistance(driverDistanceMeters)} do embarque`
            : "A localização do motorista será atualizada no mapa.",
          icon: <Navigation className="text-blue-500" size={20} />,
          color: "bg-blue-500/10 border-blue-500/20",
        };
      case "motorista_chegou":
        return {
          title: "O motorista chegou",
          subtitle: "Confira o veículo e informe o PIN somente após embarcar.",
          icon: <MapPin className="text-green-500" size={20} />,
          color: "bg-green-500/10 border-green-500/20",
        };
      case "em_viagem":
        return {
          title: "Em viagem",
          subtitle: "Acompanhe a atualização do trajeto no mapa.",
          icon: <Navigation className="text-apois-yellow" size={20} />,
          color: "bg-zinc-800 border-white/5",
        };
      case "finalizada":
        return {
          title: "Viagem concluída",
          subtitle: "Confira o valor final e avalie o motorista.",
          icon: <CheckCircle2 className="text-green-500" size={20} />,
          color: "bg-green-500/10 border-green-500/20",
        };
      case "cancelada_passageiro":
      case "cancelada_motorista":
        return {
          title: "Viagem cancelada",
          subtitle:
            status === "cancelada_motorista" ? "Cancelada pelo motorista" : "Cancelada por você",
          icon: <XCircle className="text-red-500" size={20} />,
          color: "bg-red-500/10 border-red-500/20",
        };
      case "agendada":
        return {
          title: "Corrida agendada",
          subtitle: "A busca por motorista começará no horário programado.",
          icon: <MapPin className="text-apois-yellow" size={20} />,
          color: "bg-apois-yellow/10 border-apois-yellow/20",
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl border px-4 py-3.5 transition-all duration-500",
        config.color,
      )}
    >
      <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/20">
        {config.icon}
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <h3 className="text-base font-black leading-5 text-white">{config.title}</h3>
        <p className="mt-1 line-clamp-2 text-[11px] font-medium leading-4 text-zinc-400">
          {config.subtitle}
        </p>
      </div>
      {isRefreshing ? <div className="mt-2 h-2 w-2 shrink-0 animate-ping rounded-full bg-apois-yellow" /> : null}
    </div>
  );
}
