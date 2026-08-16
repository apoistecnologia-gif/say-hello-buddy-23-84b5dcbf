import React from "react";
import { useRoute } from "@/hooks/use-route";
import { useDestination } from "@/hooks/use-destination";
import { usePickupAddress } from "@/hooks/use-pickup-address";
import { Loader2, AlertCircle, MapPin, Navigation, Clock, RefreshCw, X } from "lucide-react";

function safeNonNegativeNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function formatDistance(value: unknown): string {
  const meters = safeNonNegativeNumber(value);
  if (meters === null) return "Distância indisponível";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
}

function formatDuration(value: unknown): string {
  const seconds = safeNonNegativeNumber(value);
  if (seconds === null) return "Tempo indisponível";
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours} h ${remainingMinutes} min` : `${hours} h`;
}

export const RouteSummary: React.FC = () => {
  const { route, status, isLoading, error, retry, clearRoute, isStale, refresh } = useRoute();
  const { destination, clearDestination } = useDestination();
  const { pickupLabel } = usePickupAddress();

  if (!destination && !route) return null;

  const pickup = pickupLabel?.trim() || "Seu local";
  const destinationLabel = destination?.label?.trim() || "Destino selecionado";

  const handleClear = () => {
    clearDestination();
    clearRoute();
  };

  return (
    <section
      className="min-w-0 space-y-4 rounded-3xl border border-white/5 bg-[#1e1e1e]/95 p-4 shadow-2xl backdrop-blur-lg sm:p-5"
      aria-label="Resumo do trajeto"
      aria-busy={isLoading}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1 pr-1">
          <div className="mb-3 flex min-w-0 items-center gap-2">
            <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" aria-hidden="true" />
            <p className="min-w-0 break-words text-xs font-black uppercase tracking-[0.12em] text-gray-500">
              Resumo do trajeto
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800" aria-hidden="true">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
              </div>
              <p className="min-w-0 flex-1 break-words text-sm font-medium leading-5 text-gray-300 [overflow-wrap:anywhere]">
                {pickup}
              </p>
            </div>

            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800" aria-hidden="true">
                <MapPin className="h-3.5 w-3.5 text-yellow-500" />
              </div>
              <p className="min-w-0 flex-1 break-words text-sm font-bold leading-5 text-white [overflow-wrap:anywhere]">
                {destinationLabel}
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleClear}
          disabled={isLoading}
          aria-label="Limpar rota selecionada"
          className="app-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-800/50 text-gray-400 transition-colors disabled:cursor-not-allowed disabled:opacity-50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apois-yellow"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="border-t border-white/5 pt-2">
        {isLoading ? (
          <div className="flex flex-wrap items-center justify-center gap-3 py-4 text-center" role="status" aria-live="polite">
            <Loader2 className="h-5 w-5 animate-spin text-yellow-500 motion-reduce:animate-none" aria-hidden="true" />
            <span className="break-words text-sm font-bold uppercase tracking-wider text-yellow-500">
              Calculando melhor rota...
            </span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-2 text-center" role="alert" aria-live="assertive">
            <div className="flex max-w-full flex-wrap items-start justify-center gap-2 text-red-400">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <p className="min-w-0 break-words text-sm font-medium [overflow-wrap:anywhere]">
                Não foi possível calcular a rota agora.
              </p>
            </div>
            <button
              type="button"
              onClick={retry}
              className="app-pressable flex min-h-11 max-w-full flex-wrap items-center justify-center gap-2 rounded-full bg-white/5 px-4 text-center text-xs font-bold uppercase tracking-wider text-white transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apois-yellow"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="break-words">Tentar novamente</span>
            </button>
          </div>
        ) : route ? (
          <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
            <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 min-[360px]:grid-cols-2">
              <div className="min-w-0" aria-label={`Distância: ${formatDistance(route.distanceMeters)}`}>
                <div className="mb-0.5 flex min-w-0 items-center gap-1.5 text-gray-400">
                  <Navigation className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="break-words text-xs font-black uppercase tracking-tight">Distância</span>
                </div>
                <p className="break-words text-xl font-black text-white [overflow-wrap:anywhere]">{formatDistance(route.distanceMeters)}</p>
              </div>

              <div className="min-w-0" aria-label={`Tempo estimado: ${formatDuration(route.durationSeconds)}`}>
                <div className="mb-0.5 flex min-w-0 items-center gap-1.5 text-gray-400">
                  <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="break-words text-xs font-black uppercase tracking-tight">Tempo estimado</span>
                </div>
                <p className="break-words text-xl font-black text-white [overflow-wrap:anywhere]">{formatDuration(route.durationSeconds)}</p>
              </div>
            </div>

            {isStale ? (
              <button
                type="button"
                onClick={refresh}
                disabled={isLoading}
                aria-label="Atualizar rota desatualizada"
                className="app-pressable flex min-h-11 max-w-full shrink-0 flex-wrap items-center justify-center gap-1.5 rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 text-xs font-black uppercase text-yellow-500 transition-all disabled:cursor-not-allowed disabled:opacity-50 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apois-yellow"
              >
                <RefreshCw className="h-3.5 w-3.5 animate-pulse motion-reduce:animate-none" aria-hidden="true" />
                <span className="break-words">Atualizar</span>
              </button>
            ) : null}
          </div>
        ) : status === "debouncing" ? (
          <div className="flex flex-wrap items-center justify-center gap-3 py-4 text-center opacity-70" role="status" aria-live="polite">
            <Loader2 className="h-5 w-5 animate-spin text-gray-500 motion-reduce:animate-none" aria-hidden="true" />
            <span className="break-words text-sm font-bold uppercase tracking-wider text-gray-500">Atualizando dados da rota...</span>
          </div>
        ) : (
          <p className="break-words py-3 text-center text-xs font-medium leading-5 text-zinc-500" role="status">
            A rota será exibida assim que o cálculo estiver disponível.
          </p>
        )}
      </div>
    </section>
  );
};