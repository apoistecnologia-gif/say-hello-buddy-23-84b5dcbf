import React from "react";
import { ActiveRide } from "@/types/rides/active-ride";
import { User, Star, Phone } from "lucide-react";

interface DriverCardProps {
  ride: ActiveRide;
}

export const DriverCard: React.FC<DriverCardProps> = ({ ride }) => {
  if (!ride.driver_id && !ride.driver_name) return null;

  return (
    <div className="bg-zinc-900/50 rounded-2xl p-4 border border-white/5 flex items-center gap-4 animate-in fade-in slide-in-from-bottom duration-500">
      <div className="w-14 h-14 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
        {ride.driver_photo ? (
          <img
            src={ride.driver_photo}
            alt={ride.driver_name}
            className="w-full h-full object-cover"
          />
        ) : (
          <User className="text-zinc-600" size={24} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h4 className="font-bold text-white truncate">{ride.driver_name || "Motorista"}</h4>
        <div className="flex items-center gap-2 mt-0.5">
          <div className="flex items-center gap-1 text-apois-yellow">
            <Star size={12} fill="currentColor" />
            <span className="text-xs font-black">{ride.driver_rating?.toFixed(1) || "5.0"}</span>
          </div>
          <span className="text-zinc-600 text-[10px]">•</span>
          <span className="text-zinc-500 text-[10px] uppercase font-black tracking-widest">
            {ride.category || "Carro"}
          </span>
        </div>
      </div>

      {ride.driver_phone && (
        <a
          href={`tel:${ride.driver_phone}`}
          className="w-12 h-12 rounded-full bg-apois-yellow flex items-center justify-center active:scale-90 transition-transform"
        >
          <Phone className="text-black" size={20} />
        </a>
      )}
    </div>
  );
};
