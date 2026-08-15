import React from "react";
import { useRoute } from "@/hooks/use-route";
import { useDestination } from "@/hooks/use-destination";
import { usePickupAddress } from "@/hooks/use-pickup-address";
import { Loader2, AlertCircle, MapPin, Navigation, Clock, RefreshCw, X } from "lucide-react";

export const RouteSummary: React.FC = () => {
  const { route, status, isLoading, error, retry, clearRoute, isStale, refresh } = useRoute();
  const { destination, clearDestination } = useDestination();
  const { pickupLabel } = usePickupAddress();

  if (!destination && !route) return null;

  const formatDistance = (meters: number): string => {
    if (meters < 1000) return `${Math.round(meters)} m`;
    const km = meters / 1000;
    return `${km.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
  };

  const formatDuration = (seconds: number): string => {
    const minutes = Math.ceil(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours} h ${remainingMinutes} min` : `${hours} h`;
  };

  const handleClear = () => {
    clearDestination();
    clearRoute();
  };

  const getErrorMessage = (err: unknown): string => {
    if (typeof err === "string") return err;
    if (err && typeof err === "object" && "message" in err) return String(err.message);
    return "Erro desconhecido";
  };

  return (
    <div className="space-y-4 rounded-3xl border border-white/5 bg-[#1e1e1e]/95 p-5 shadow-2xl backdrop-blur-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 pr-1">
          <div className="mb-3 flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">
              Resumo do Trajeto
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
              </div>
              <p className="truncate text-sm font-medium text-gray-300">
                {pickupLabel || "Seu local"}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800">
                <MapPin className="h-3.5 w-3.5 text-yellow-500" />
              </div>
              <p className="truncate text-sm font-bold text-white">
                {destination?.label || "Destino"}
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleClear}
          aria-label="Limpar rota selecionada"
          className="app-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-800/50 text-gray-400 transition-colors hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="border-t border-white/5 pt-2">
        {isLoading ? (
          <div className="flex items-center justify-center gap-3 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-yellow-500" />
            <span className="text-sm font-bold uppercase tracking-wider text-yellow-500">
              Calculando melhor rota...
            </span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="h-5 w-5" />
              <p className="text-sm font-medium">{getErrorMessage(error)}</p>
            </div>
            <button
              type="button"
              onClick={retry}
              className="app-pressable flex min-h-11 items-center gap-2 rounded-full bg-white/5 px-4 text-xs font-bold uppercase tracking-wider text-white transition-all active:scale-95"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Tentar novamente
            </button>
          </div>
        ) : route ? (
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-6 gap-y-3">
              <div className="flex min-w-[96px] flex-col">
                <div className="mb-0.5 flex items-center gap-1.5 text-gray-400">
                  <Navigation className="h-3 w-3" />
                  <span className="text-[10px] font-black uppercase tracking-tight">Distância</span>
                </div>
                <p className="text-xl font-black text-white">{formatDistance(route.distanceMeters)}</p>
              </div>

              <div className="flex min-w-[118px] flex-col">
                <div className="mb-0.5 flex items-center gap-1.5 text-gray-400">
                  <Clock className="h-3 w-3" />
                  <span className="text-[10px] font-black uppercase tracking-tight">Tempo estimado</span>
                </div>
                <p className="text-xl font-black text-white">{formatDuration(route.durationSeconds)}</p>
              </div>
            </div>

            {isStale ? (
              <button
                type="button"
                onClick={refresh}
                className="app-pressable flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 text-[10px] font-black uppercase text-yellow-500 transition-all active:scale-95"
              >
                <RefreshCw className="h-3.5 w-3.5 animate-pulse" />
                Atualizar
              </button>
            ) : null}
          </div>
        ) : status === "debouncing" ? (
          <div className="flex items-center justify-center gap-3 py-4 opacity-50">
            <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
            <span className="text-sm font-bold uppercase tracking-wider text-gray-500">Aguardando...</span>
          </div>
        ) : null}
      </div>
    </div>
  );
};
