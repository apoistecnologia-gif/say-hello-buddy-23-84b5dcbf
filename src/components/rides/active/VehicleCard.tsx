import React from "react";
import { ActiveRide } from "@/types/rides/active-ride";
import { Car } from "lucide-react";

interface VehicleCardProps {
  ride: ActiveRide;
}

export const VehicleCard: React.FC<VehicleCardProps> = ({ ride }) => {
  if (!ride.driver_vehicle_model && !ride.driver_vehicle_plate) return null;

  return (
    <div className="bg-zinc-900/50 rounded-2xl p-4 border border-white/5 space-y-3 animate-in fade-in slide-in-from-bottom duration-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-500">
            <Car size={20} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Veículo
            </p>
            <p className="font-bold text-white text-sm">
              {ride.driver_vehicle_model}{" "}
              {ride.driver_vehicle_color && (
                <span className="text-zinc-500 font-medium">• {ride.driver_vehicle_color}</span>
              )}
            </p>
          </div>
        </div>

        <div className="bg-white px-3 py-1.5 rounded-lg border-2 border-zinc-300 shadow-inner">
          <p className="text-[10px] font-black text-zinc-400 leading-none mb-0.5 uppercase tracking-tighter">
            Brasil
          </p>
          <p className="text-black font-black text-sm tracking-widest leading-none">
            {ride.driver_vehicle_plate}
          </p>
        </div>
      </div>

      <div className="p-3 bg-blue-500/5 rounded-xl border border-blue-500/10 flex gap-3 items-center">
        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
        <p className="text-[10px] text-blue-400 font-medium">
          Confira a placa e o veículo antes de embarcar.
        </p>
      </div>
    </div>
  );
};
