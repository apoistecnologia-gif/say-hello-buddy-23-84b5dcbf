import type { ActiveRide } from "@/types/rides/active-ride";
import { Car } from "lucide-react";

interface VehicleCardProps {
  ride: ActiveRide;
}

export function VehicleCard({ ride }: VehicleCardProps) {
  const model = ride.driver_vehicle_model?.trim() ?? "";
  const color = ride.driver_vehicle_color?.trim() ?? "";
  const plate = ride.driver_vehicle_plate?.trim().toUpperCase() ?? "";

  if (!model && !plate) return null;

  return (
    <section className="space-y-3 rounded-2xl border border-white/5 bg-zinc-900/50 p-4 animate-in fade-in slide-in-from-bottom duration-700">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-zinc-500">
            <Car size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Veículo
            </p>
            <p className="truncate text-sm font-bold text-white">
              {model || "Modelo não informado"}
              {color ? <span className="font-medium text-zinc-500"> • {color}</span> : null}
            </p>
          </div>
        </div>

        {plate ? (
          <div
            className="shrink-0 rounded-lg border-2 border-zinc-300 bg-white px-3 py-1.5 shadow-inner"
            aria-label={`Placa do veículo ${plate}`}
          >
            <p className="mb-0.5 text-[10px] font-black uppercase leading-none tracking-tighter text-zinc-400">
              Brasil
            </p>
            <p className="text-sm font-black uppercase leading-none tracking-widest text-black">
              {plate}
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-blue-500/10 bg-blue-500/5 p-3">
        <div className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-blue-500" />
        <p className="text-[10px] font-medium text-blue-400">
          Confira a placa, o modelo e a cor antes de embarcar.
        </p>
      </div>
    </section>
  );
}
