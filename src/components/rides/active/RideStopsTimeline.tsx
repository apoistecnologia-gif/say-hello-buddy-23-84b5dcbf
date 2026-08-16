import React from "react";
import type { ActiveRide } from "@/types/rides/active-ride";

interface RideStopsTimelineProps {
  ride: ActiveRide;
}

function cleanLabel(value: string | null | undefined, fallback: string): string {
  const normalized = value?.trim().replace(/\s+/g, " ");
  return normalized || fallback;
}

export const RideStopsTimeline: React.FC<RideStopsTimelineProps> = ({ ride }) => {
  const stops = ride.intermediates ?? [];
  const origin = cleanLabel(ride.origin_name, "Local de embarque");
  const destination = cleanLabel(ride.destination_name, "Destino da corrida");

  return (
    <section
      className="min-w-0 space-y-4 rounded-2xl border border-white/5 bg-zinc-900/30 p-4 max-[339px]:p-3"
      aria-labelledby="ride-stops-title"
    >
      <h2 id="ride-stops-title" className="sr-only">Trajeto da corrida</h2>
      <div className="flex min-w-0 gap-3 sm:gap-4">
        <div className="flex shrink-0 flex-col items-center py-1" aria-hidden="true">
          <div className="h-2.5 w-2.5 rounded-full bg-apois-yellow shadow-[0_0_8px_rgba(255,184,0,0.4)]" />
          <div className="my-1 w-px flex-1 bg-zinc-800" />
          {stops.map((stop, i) => (
            <React.Fragment key={`${stop.lat}:${stop.lng}:${i}`}>
              <div className="h-2.5 w-2.5 rounded-full border border-zinc-600 bg-zinc-900" />
              <div className="my-1 w-px flex-1 bg-zinc-800" />
            </React.Fragment>
          ))}
          <div className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
        </div>

        <ol className="min-w-0 flex-1 space-y-5 py-0.5">
          <li className="min-w-0">
            <p className="mb-0.5 break-words text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Embarque
            </p>
            <p className="break-words text-xs font-bold leading-5 text-zinc-300 [overflow-wrap:anywhere]">{origin}</p>
          </li>

          {stops.map((stop, i) => {
            const stopLabel = cleanLabel(stop.address, cleanLabel(stop.label, `Parada intermediária ${i + 1}`));
            return (
              <li key={`${stop.lat}:${stop.lng}:${i}`} className="min-w-0">
                <p className="mb-0.5 break-words text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  Parada {i + 1}
                </p>
                <p className="break-words text-xs font-bold leading-5 text-zinc-300 [overflow-wrap:anywhere]">
                  {stopLabel}
                </p>
              </li>
            );
          })}

          <li className="min-w-0">
            <p className="mb-0.5 break-words text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Destino final
            </p>
            <p className="break-words text-xs font-bold leading-5 text-zinc-300 [overflow-wrap:anywhere]">{destination}</p>
          </li>
        </ol>
      </div>
    </section>
  );
};