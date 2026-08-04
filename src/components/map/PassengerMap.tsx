import React from "react";
import { useLocation } from "@/hooks/use-location";
import { useRoute } from "@/hooks/use-route";

const PassengerMap: React.FC = () => {
  const { location, currentPosition, permissionStatus } = useLocation();
  const { route } = useRoute();

  return (
    <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-zinc-500 overflow-hidden relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-800 to-black opacity-50" />
      <div className="z-10 text-center p-8">
        <p className="font-bold text-lg mb-2 text-white">Mapa Interativo APOIS</p>
        <p className="text-sm">Localização: {location ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : "Aguardando GPS..."}</p>
        <p className="text-sm mt-1 text-zinc-600">Permissão: {permissionStatus?.location || "unknown"}</p>
        {route && (
           <p className="text-xs mt-4 text-apois-yellow">Rota carregada: ${(route.distanceMeters / 1000).toFixed(1)}km</p>
        )}
      </div>
      
      {/* Simulation of polyline/markers */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-px h-full bg-white/5 absolute left-1/2" />
        <div className="h-px w-full bg-white/5 absolute top-1/2" />
      </div>
    </div>
  );
};

export default PassengerMap;
