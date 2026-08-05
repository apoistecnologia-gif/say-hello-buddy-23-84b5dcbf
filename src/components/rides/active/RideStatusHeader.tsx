import React, { useMemo } from "react";
import { RideStatus } from "@/types/rides/active-ride";
import { Search, Navigation, MapPin, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveRide } from "@/hooks/rides/use-active-ride";

interface RideStatusHeaderProps {
  status: RideStatus;
  isRefreshing?: boolean;
  driverDistanceMeters?: number | null;
  estimatedArrivalMinutes?: number | null;
}

function formatDistance(distanceMeters: number): string {
  if (distanceMeters < 1000) return `${Math.max(50, Math.round(distanceMeters / 50) * 50)} m`;
  return `${(distanceMeters / 1000).toFixed(distanceMeters < 10_000 ? 1 : 0).replace(".", ",")} km`;
}

function distanceBetweenMeters(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(to.lat - from.lat);
  const longitudeDelta = toRadians(to.lng - from.lng);
  const fromLatitude = toRadians(from.lat);
  const toLatitude = toRadians(to.lat);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function estimateUrbanArrivalMinutes(distanceMeters: number): number {
  const routedDistanceMeters = distanceMeters * 1.28;
  const averageUrbanMetersPerMinute = 350;
  return Math.max(1, Math.ceil(routedDistanceMeters / averageUrbanMetersPerMinute));
}

export const RideStatusHeader: React.FC<RideStatusHeaderProps> = ({
  status,
  isRefreshing,
  driverDistanceMeters,
  estimatedArrivalMinutes,
}) => {
  const { ride } = useActiveRide();

  const derivedEstimate = useMemo(() => {
    if (
      status !== "motorista_a_caminho" ||
      !ride ||
      typeof ride.driver_latitude !== "number" ||
      !Number.isFinite(ride.driver_latitude) ||
      typeof ride.driver_longitude !== "number" ||
      !Number.isFinite(ride.driver_longitude)
    ) {
      return null;
    }

    const distance = distanceBetweenMeters(
      { lat: ride.driver_latitude, lng: ride.driver_longitude },
      ride.origin,
    );

    if (!Number.isFinite(distance) || distance < 0) return null;

    return {
      distanceMeters: distance,
      arrivalMinutes: estimateUrbanArrivalMinutes(distance),
    };
  }, [ride, status]);

  const effectiveDistanceMeters = driverDistanceMeters ?? derivedEstimate?.distanceMeters ?? null;
  const effectiveArrivalMinutes =
    estimatedArrivalMinutes ?? derivedEstimate?.arrivalMinutes ?? null;

  const hasDriverEstimate =
    status === "motorista_a_caminho" &&
    typeof effectiveDistanceMeters === "number" &&
    Number.isFinite(effectiveDistanceMeters) &&
    typeof effectiveArrivalMinutes === "number" &&
    Number.isFinite(effectiveArrivalMinutes);

  const getStatusConfig = () => {
    switch (status) {
      case "procurar_motorista":
        return {
          title: "Procurando motorista",
          subtitle: "Aguarde enquanto conectamos você...",
          icon: <Search className="animate-pulse text-apois-yellow" size={20} />,
          color: "bg-apois-yellow/10 border-apois-yellow/20",
        };
      case "motorista_a_caminho":
        return {
          title: hasDriverEstimate
            ? `Chegada estimada em ${Math.max(1, Math.round(effectiveArrivalMinutes))} min`
            : "Motorista a caminho",
          subtitle: hasDriverEstimate
            ? `Aproximadamente ${formatDistance(effectiveDistanceMeters)} do embarque`
            : "O motorista já aceitou sua corrida",
          icon: <Navigation className="animate-bounce text-blue-500" size={20} />,
          color: "bg-blue-500/10 border-blue-500/20",
        };
      case "motorista_chegou":
        return {
          title: "O motorista chegou",
          subtitle: "Dirija-se ao local de embarque",
          icon: <MapPin className="animate-bounce text-green-500" size={20} />,
          color: "bg-green-500/10 border-green-500/20",
        };
      case "em_viagem":
        return {
          title: "Em viagem",
          subtitle: "Acompanhe seu trajeto no mapa",
          icon: <Navigation className="text-apois-yellow" size={20} />,
          color: "bg-zinc-800 border-white/5",
        };
      case "finalizada":
        return {
          title: "Viagem concluída",
          subtitle: "Obrigado por viajar com a APOIS",
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
      default:
        return {
          title: "Status desconhecido",
          subtitle: "Aguardando atualização...",
          icon: <Search className="text-zinc-500" size={20} />,
          color: "bg-zinc-800 border-white/5",
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
      {isRefreshing && <div className="h-2 w-2 animate-ping rounded-full bg-apois-yellow" />}
    </div>
  );
};
