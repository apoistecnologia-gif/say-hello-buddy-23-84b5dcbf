import React from "react";
import { ActiveRide } from "@/types/rides/active-ride";
import { MapPin } from "lucide-react";

interface RideStopsTimelineProps {
  ride: ActiveRide;
}

export const RideStopsTimeline: React.FC<RideStopsTimelineProps> = ({ ride }) => {
  const stops = ride.intermediates || [];

  return (
    <div className="bg-zinc-900/30 rounded-2xl p-4 border border-white/5 space-y-4">
      <div className="flex gap-4">
        <div className="flex flex-col items-center py-1 shrink-0">
          <div className="w-2.5 h-2.5 rounded-full bg-apois-yellow shadow-[0_0_8px_rgba(255,184,0,0.4)]" />
          <div className="w-px flex-1 bg-zinc-800 my-1" />
          {stops.map((_, i) => (
            <React.Fragment key={i}>
              <div className="w-2.5 h-2.5 rounded-full border border-zinc-600 bg-zinc-900" />
              <div className="w-px flex-1 bg-zinc-800 my-1" />
            </React.Fragment>
          ))}
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
        </div>
        
        <div className="flex-1 space-y-5 py-0.5">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mb-0.5">Embarque</p>
            <p className="text-xs font-bold text-zinc-300 truncate">{ride.origin_name}</p>
          </div>
          
          {stops.map((stop, i) => (
            <div key={i} className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mb-0.5">Parada {i + 1}</p>
              <p className="text-xs font-bold text-zinc-300 truncate">{stop.address || stop.label}</p>
            </div>
          ))}

          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mb-0.5">Destino Final</p>
            <p className="text-xs font-bold text-zinc-300 truncate">{ride.destination_name}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
