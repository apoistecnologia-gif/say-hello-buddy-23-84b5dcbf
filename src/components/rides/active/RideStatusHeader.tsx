import type { RideStatus } from "@/types/rides/active-ride";
import { CheckCircle2, MapPin, Navigation, Search, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface RideStatusHeaderProps {
  status: RideStatus;
  isRefreshing?: boolean | undefined;
  driverDistanceMeters?: number | null | undefined;
  estimatedArrivalMinutes?: number | null | undefined;
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
        "flex items-center gap-4 rounded-2xl border p-4 transition-all duration-500",
        config.color,
      )}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-black/20">
        {config.icon}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-black leading-tight text-white">{config.title}</h3>
        <p className="truncate text-xs font-medium text-zinc-400">{config.subtitle}</p>
      </div>
      {isRefreshing ? <div className="h-2 w-2 animate-ping rounded-full bg-apois-yellow" /> : null}
    </div>
  );
}
