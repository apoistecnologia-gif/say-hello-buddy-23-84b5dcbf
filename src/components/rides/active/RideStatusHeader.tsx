import React from "react";
import { RideStatus } from "@/types/rides/active-ride";
import { Search, Navigation, MapPin, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface RideStatusHeaderProps {
  status: RideStatus;
  isRefreshing?: boolean;
}

export const RideStatusHeader: React.FC<RideStatusHeaderProps> = ({ status, isRefreshing }) => {
  const getStatusConfig = () => {
    switch (status) {
      case "procurar_motorista":
        return {
          title: "Procurando motorista",
          subtitle: "Aguarde enquanto conectamos você...",
          icon: <Search className="text-apois-yellow animate-pulse" size={20} />,
          color: "bg-apois-yellow/10 border-apois-yellow/20"
        };
      case "motorista_a_caminho":
        return {
          title: "Motorista a caminho",
          subtitle: "O motorista já aceitou sua corrida",
          icon: <Navigation className="text-blue-500 animate-bounce" size={20} />,
          color: "bg-blue-500/10 border-blue-500/20"
        };
      case "motorista_chegou":
        return {
          title: "O motorista chegou",
          subtitle: "Dirija-se ao local de embarque",
          icon: <MapPin className="text-green-500 animate-bounce" size={20} />,
          color: "bg-green-500/10 border-green-500/20"
        };
      case "em_viagem":
        return {
          title: "Em viagem",
          subtitle: "Acompanhe seu trajeto no mapa",
          icon: <Navigation className="text-apois-yellow" size={20} />,
          color: "bg-zinc-800 border-white/5"
        };
      case "finalizada":
        return {
          title: "Viagem concluída",
          subtitle: "Obrigado por viajar com a APOIS",
          icon: <CheckCircle2 className="text-green-500" size={20} />,
          color: "bg-green-500/10 border-green-500/20"
        };
      case "cancelada_passageiro":
      case "cancelada_motorista":
        return {
          title: "Viagem cancelada",
          subtitle: status === "cancelada_motorista" ? "Cancelada pelo motorista" : "Cancelada por você",
          icon: <XCircle className="text-red-500" size={20} />,
          color: "bg-red-500/10 border-red-500/20"
        };
      default:
        return {
          title: "Status desconhecido",
          subtitle: "Aguardando atualização...",
          icon: <Search className="text-zinc-500" size={20} />,
          color: "bg-zinc-800 border-white/5"
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className={cn("p-4 rounded-2xl border flex items-center gap-4 transition-all duration-500", config.color)}>
      <div className="w-12 h-12 rounded-full bg-black/20 flex items-center justify-center shrink-0">
        {config.icon}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-black text-white text-lg leading-tight">{config.title}</h3>
        <p className="text-xs text-zinc-400 font-medium truncate">{config.subtitle}</p>
      </div>
      {isRefreshing && (
        <div className="w-2 h-2 rounded-full bg-apois-yellow animate-ping" />
      )}
    </div>
  );
};
