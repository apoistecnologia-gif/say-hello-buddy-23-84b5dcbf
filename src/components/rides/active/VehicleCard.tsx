import type { ActiveRide } from "@/types/rides/active-ride";
import { Car } from "lucide-react";

interface VehicleCardProps {
  ride: ActiveRide;
}

function normalizePlate(value: unknown): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 7);
}

export function VehicleCard({ ride }: VehicleCardProps) {
  const model = ride.driver_vehicle_model?.trim() || "";
  const color = ride.driver_vehicle_color?.trim() || "";
  const plate = normalizePlate(ride.driver_vehicle_plate);

  if (!model && !plate && !color) return null;

  return (
    <section
      className="min-w-0 space-y-3 rounded-2xl border border-white/5 bg-zinc-900/50 p-4 animate-in fade-in slide-in-from-bottom duration-700 motion-reduce:animate-none"
      aria-labelledby="active-ride-vehicle-title"
    >
      <div className="flex min-w-0 items-start justify-between gap-3 max-[379px]:flex-col">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-zinc-500" aria-hidden="true">
            <Car size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p id="active-ride-vehicle-title" className="break-words text-xs font-black uppercase leading-5 tracking-wide text-zinc-500">
              Veículo
            </p>
            <p className="break-words text-sm font-bold leading-5 text-white [overflow-wrap:anywhere]">
              {model || "Modelo não informado"}
              {color ? <span className="font-medium text-zinc-400"> • {color}</span> : null}
            </p>
          </div>
        </div>

        {plate ? (
          <div
            className="max-w-full shrink-0 rounded-lg border-2 border-zinc-300 bg-white px-3 py-2 shadow-inner max-[379px]:ml-[56px] max-[339px]:ml-0"
            aria-label={`Placa do veículo ${plate.split("").join(" ")}`}
          >
            <p className="mb-1 text-xs font-black uppercase leading-none tracking-tight text-zinc-500">Brasil</p>
            <p className="break-all text-base font-black uppercase leading-none tracking-[0.14em] text-black">{plate}</p>
          </div>
        ) : (
          <p className="max-w-full break-words rounded-xl border border-white/5 bg-black/20 px-3 py-2 text-xs font-medium leading-5 text-zinc-500 max-[379px]:ml-[56px] max-[339px]:ml-0">
            Placa não informada
          </p>
        )}
      </div>

      <div className="flex min-w-0 items-start gap-3 rounded-xl border border-blue-500/10 bg-blue-500/5 p-3" role="note">
        <div className="mt-2 h-2 w-2 shrink-0 animate-pulse rounded-full bg-blue-500 motion-reduce:animate-none" aria-hidden="true" />
        <p className="min-w-0 break-words text-xs font-medium leading-5 text-blue-300 [overflow-wrap:anywhere]">
          Confira a placa, o modelo e a cor antes de embarcar. Se os dados não coincidirem, não entre no veículo.
        </p>
      </div>
    </section>
  );
}
