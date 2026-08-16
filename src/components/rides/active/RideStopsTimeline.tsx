import React from "react";
import { ActiveRide } from "@/types/rides/active-ride";

interface RideStopsTimelineProps {
  ride: ActiveRide;
}

export const RideStopsTimeline: React.FC<RideStopsTimelineProps> = ({ ride }) => {
  const stops = ride.intermediates || [];

  return (
    <div className="space-y-4 rounded-2xl border border-white/5 bg-zinc-900/30 p-4">
      <div className="flex gap-3 sm:gap-4">
        <div className="flex shrink-0 flex-col items-center py-1" aria-hidden="true">
          <div className="h-2.5 w-2.5 rounded-full bg-apois-yellow shadow-[0_0_8px_rgba(255,184,0,0.4)]" />
          <div className="my-1 w-px flex-1 bg-zinc-800" />
          {stops.map((stop, i) => (
            <React.Fragment key={`${stop.address || stop.label || "parada"}-${i}`}>
              <div className="h-2.5 w-2.5 rounded-full border border-zinc-600 bg-zinc-900" />
              <div className="my-1 w-px flex-1 bg-zinc-800" />
            </React.Fragment>
          ))}
          <div className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
        </div>

        <div className="min-w-0 flex-1 space-y-5 py-0.5">
          <div className="min-w-0">
            <p className="mb-0.5 text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Embarque
            </p>
            <p className="break-words text-xs font-bold leading-5 text-zinc-300">{ride.origin_name}</p>
          </div>

          {stops.map((stop, i) => (
            <div key={`${stop.address || stop.label || "parada"}-${i}`} className="min-w-0">
              <p className="mb-0.5 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                Parada {i + 1}
              </p>
              <p className="break-words text-xs font-bold leading-5 text-zinc-300">
                {stop.address || stop.label}
              </p>
            </div>
          ))}

          <div className="min-w-0">
            <p className="mb-0.5 text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Destino final
            </p>
            <p className="break-words text-xs font-bold leading-5 text-zinc-300">{ride.destination_name}</p>
          </div>
        </div>
      </div>
    </div>
  );
};