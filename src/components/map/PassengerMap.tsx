import React from "react";
import { useLocation } from "@/hooks/use-location";
import { useRoute } from "@/hooks/use-route";
import { useRideStops } from "@/hooks/rides/use-ride-stops";
import { useDestination } from "@/hooks/use-destination";

const PassengerMap: React.FC = () => {
  const { location, permissionStatus } = useLocation();
  const { route } = useRoute();
  const { orderedStops } = useRideStops();
  const { destination } = useDestination();

  return (
    <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-zinc-500 overflow-hidden relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-800 to-black opacity-50" />
      <div className="z-10 text-center p-8">
        <p className="font-bold text-lg mb-2 text-white">Mapa Interativo APOIS</p>
        <p className="text-sm">Localização: {location ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : "Aguardando GPS..."}</p>
        <p className="text-sm mt-1 text-zinc-600">Permissão: {permissionStatus?.location || "unknown"}</p>
        
        {route && (
           <div className="mt-4 space-y-1">
             <p className="text-xs text-apois-yellow font-bold">Rota: ${(route.distanceMeters / 1000).toFixed(1)}km</p>
             <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Via {orderedStops.length} paradas</p>
           </div>
        )}
      </div>
      
      {/* Legend / Info Overlay */}
      <div className="absolute bottom-32 left-5 right-5 z-10 flex flex-wrap gap-2 pointer-events-none">
        {orderedStops.length > 0 && orderedStops.map((stop, i) => (
          <div key={stop.id} className="bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10 flex items-center gap-1.5 animate-in zoom-in duration-300">
            <div className="w-3 h-3 rounded-full bg-zinc-700 flex items-center justify-center">
              <span className="text-[8px] font-black text-white">{i + 1}</span>
            </div>
            <span className="text-[9px] font-bold text-zinc-300">{stop.label.split(',')[0]}</span>
          </div>
        ))}
        {destination && (
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
