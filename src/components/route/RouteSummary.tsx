import React from 'react';
import { useRoute } from '@/hooks/use-route';
import { useDestination } from '@/hooks/use-destination';
import { usePickupAddress } from '@/hooks/use-pickup-address';
import { Loader2, AlertCircle, MapPin, Navigation, Clock, RefreshCw, X } from 'lucide-react';

export const RouteSummary: React.FC = () => {
  const { 
    route, 
    status, 
    isLoading, 
    error, 
    retry, 
    clearRoute,
    isStale,
    refresh
  } = useRoute();
  
  const { destination, clearDestination } = useDestination();
  const { pickupLabel } = usePickupAddress();

  if (!destination && !route) return null;

  const formatDistance = (meters: number): string => {
    if (meters < 1000) return `${Math.round(meters)} m`;
    const km = meters / 1000;
    return `${km.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
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

  const getErrorMessage = (err: any): string => {
    if (typeof err === "string") return err;
    if (err && typeof err === "object" && "message" in err) return String(err.message);
    return "Erro desconhecido";
  };

  return (
    <div className="bg-[#1e1e1e]/95 backdrop-blur-lg rounded-3xl p-5 border border-white/5 shadow-2xl space-y-4">
      {/* Route Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-2 mb-3">
             <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
             <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Resumo do Trajeto</p>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
              </div>
              <p className="text-sm font-medium text-gray-300 truncate">
                {pickupLabel || 'Seu local'}
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                <MapPin className="w-3.5 h-3.5 text-yellow-500" />
              </div>
              <p className="text-sm font-bold text-white truncate">
                {destination?.label || 'Destino'}
              </p>
            </div>
          </div>
        </div>

        <button 
          onClick={handleClear}
          className="p-2 bg-zinc-800/50 rounded-full text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Route Data / Status */}
      <div className="pt-2 border-t border-white/5">
        {isLoading ? (
          <div className="flex items-center justify-center py-4 gap-3">
            <Loader2 className="w-5 h-5 text-yellow-500 animate-spin" />
            <span className="text-sm font-bold text-yellow-500 uppercase tracking-wider">Calculando melhor rota...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="w-5 h-5" />
              <p className="text-sm font-medium">{getErrorMessage(error)}</p>
            </div>
            <button 
              onClick={retry}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full text-xs font-bold uppercase tracking-wider text-white active:scale-95 transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Tentar Novamente
            </button>
          </div>
        ) : route ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5 text-gray-400 mb-0.5">
                  <Navigation className="w-3 h-3" />
                  <span className="text-[10px] font-black uppercase tracking-tight">Distância</span>
                </div>
                <p className="text-xl font-black text-white">{formatDistance(route.distanceMeters)}</p>
              </div>
              
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5 text-gray-400 mb-0.5">
                  <Clock className="w-3 h-3" />
                  <span className="text-[10px] font-black uppercase tracking-tight">Tempo Estimado</span>
                </div>
                <p className="text-xl font-black text-white">{formatDuration(route.durationSeconds)}</p>
              </div>
            </div>

            {isStale && (
              <button 
                onClick={refresh}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg active:scale-95 transition-all"
              >
                <RefreshCw className="w-3 h-3 text-yellow-500 animate-pulse" />
                <span className="text-[8px] font-black text-yellow-500 uppercase">Atualizar</span>
              </button>
            )}
          </div>
        ) : status === 'debouncing' ? (
          <div className="flex items-center justify-center py-4 gap-3 opacity-50">
            <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
            <span className="text-sm font-bold text-gray-500 uppercase tracking-wider">Aguardando...</span>
          </div>
        ) : null}
      </div>
    </div>
  );
};
