import React from "react";
import { useLocation } from "@/hooks/use-location";
import { useRoute } from "@/hooks/use-route";
import { useRideStops } from "@/hooks/rides/use-ride-stops";
import { useDestination } from "@/hooks/use-destination";

interface PassengerMapProps {
  origin: { lat: number; lng: number } | undefined;
  destination: { lat: number; lng: number } | undefined;
  encodedPolyline: string | undefined;
  driverLocation: { lat: number; lng: number; heading?: number } | undefined;
  isStatic: boolean | undefined;
}

const PassengerMap: React.FC<PassengerMapProps> = ({ 
  origin: customOrigin, 
  destination: customDestination,
  encodedPolyline,
  driverLocation,
  isStatic 
}) => {
  const { location, permissionState } = useLocation();
  const { route } = useRoute();
  const { orderedStops } = useRideStops();
  const { destination: globalDestination } = useDestination();

  const currentLat = customOrigin?.lat || location?.latitude;
  const currentLng = customOrigin?.lng || location?.longitude;
  const targetDest = customDestination || globalDestination;

  return (
    <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-zinc-500 overflow-hidden relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-800 to-black opacity-50" />
      <div className="z-10 text-center p-8">
        <p className="font-bold text-lg mb-2 text-white">Mapa Interativo APOIS</p>
        <p className="text-sm">
          Foco: {currentLat ? `${currentLat.toFixed(6)}, ${currentLng?.toFixed(6)}` : "Aguardando GPS..."}
        </p>
        <p className="text-[10px] text-zinc-600 uppercase mt-2">
          {isStatic ? "Visão Estática de Trajeto" : "Acompanhamento em Tempo Real"}
        </p>
        
        {driverLocation && (
          <div className="mt-4 p-3 bg-apois-yellow/10 border border-apois-yellow/20 rounded-2xl animate-pulse">
            <p className="text-xs font-black text-apois-yellow">Motorista Conectado</p>
            <p className="text-[10px] text-zinc-500 mt-1">
              Local: {driverLocation.lat.toFixed(4)}, {driverLocation.lng.toFixed(4)}
            </p>
          </div>
        )}
      </div>
      
      {/* Legend / Info Overlay */}
      <div className="absolute bottom-32 left-5 right-5 z-10 flex flex-wrap gap-2 pointer-events-none">
        {orderedStops.length > 0 && orderedStops.map((stop, i) => (
          <div key={stop.id} className="bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10 flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-zinc-700 flex items-center justify-center">
              <span className="text-[8px] font-black text-white">{i + 1}</span>
            </div>
            <span className="text-[9px] font-bold text-zinc-300">{stop.label.split(',')[0]}</span>
          </div>
        ))}
        {targetDest && (
          <div className="bg-apois-yellow/10 backdrop-blur-md px-2 py-1 rounded-lg border border-apois-yellow/30 flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-apois-yellow shadow-[0_0_5px_rgba(255,184,0,0.5)]" />
            <span className="text-[9px] font-bold text-apois-yellow">Destino</span>
          </div>
        )}
      </div>
      
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-px h-full bg-white/5 absolute left-1/2" />
        <div className="h-px w-full bg-white/5 absolute top-1/2" />
      </div>
    </div>
  );
};

export default PassengerMap;
