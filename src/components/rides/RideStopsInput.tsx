import React from 'react';
import { useRideStops } from '@/hooks/rides/use-ride-stops';
import { useDestination } from '@/hooks/use-destination';
import { usePickupAddress } from '@/hooks/use-pickup-address';
import { Plus, X, GripVertical, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, Reorder, AnimatePresence } from 'framer-motion';
import { useNavigate } from '@tanstack/react-router';

export const RideStopsInput: React.FC = () => {
  const { 
    stops, 
    orderedStops, 
    canAddStop, 
    removeStop, 
    reorderStops,
    isEditing,
    setIsEditing
  } = useRideStops();
  
  const { pickupLabel } = usePickupAddress();
  const { destination } = useDestination();
  const navigate = useNavigate();

  if (!isEditing && stops.length === 0) {
    return (
      <div className="px-4 py-2">
        <button 
          onClick={() => setIsEditing(true)}
          className="flex items-center gap-2 text-apois-yellow font-bold text-xs py-2 px-3 rounded-lg bg-apois-yellow/10 border border-apois-yellow/20"
        >
          <Plus size={14} />
          Adicionar parada
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Seu Trajeto</h3>
        {canAddStop && (
          <button 
            onClick={() => navigate({ to: '/buscar-destino', search: { stop: true } })}
            className="text-apois-yellow font-bold text-[10px] uppercase tracking-wider flex items-center gap-1"
          >
            <Plus size={12} />
            Nova Parada
          </button>
        )}
      </div>

      <div className="space-y-3 relative">
        <div className="absolute left-[15px] top-4 bottom-4 w-0.5 border-l border-dashed border-zinc-700" />

        <div className="flex items-center gap-3 relative z-10">
          <div className="w-8 h-8 rounded-full bg-zinc-900 border border-blue-500/30 flex items-center justify-center shrink-0">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
          </div>
          <div className="flex-1 min-w-0 py-2 px-3 bg-zinc-900/50 rounded-xl border border-white/5 opacity-60">
            <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-tighter">Partida</p>
            <p className="text-xs font-medium text-zinc-400 truncate">{pickupLabel || 'Minha localização'}</p>
          </div>
        </div>

        <Reorder.Group axis="y" values={orderedStops} onReorder={reorderStops} className="space-y-3">
          <AnimatePresence initial={false}>
            {orderedStops.map((stop, index) => (
              <Reorder.Item 
                key={stop.id} 
                value={stop}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex items-center gap-3 relative z-10"
              >
                <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing shadow-lg">
                  <span className="text-[10px] font-black text-white">{index + 1}</span>
                </div>
                <div className="flex-1 flex items-center gap-2 py-2 px-3 bg-zinc-800 rounded-xl border border-white/10 group">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-tighter">Parada {index + 1}</p>
                    <p className="text-xs font-bold text-white truncate">{stop.label}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => removeStop(stop.id)}
                      className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors"
                    >
                      <X size={14} />
                    </button>
                    <GripVertical size={16} className="text-zinc-600" />
                  </div>
                </div>
              </Reorder.Item>
            ))}
          </AnimatePresence>
        </Reorder.Group>

        <div className="flex items-center gap-3 relative z-10">
          <div className="w-8 h-8 rounded-full bg-zinc-900 border border-yellow-500/30 flex items-center justify-center shrink-0">
            <MapPin size={14} className="text-yellow-500" />
          </div>
          <div className="flex-1 min-w-0 py-2 px-3 bg-zinc-900/50 rounded-xl border border-white/5 opacity-80">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-tighter">Destino</p>
            <p className="text-xs font-bold text-white truncate">{destination?.label || '...'}</p>
          </div>
        </div>
      </div>
      
      {isEditing && (
        <div className="flex gap-2 pt-2">
          <button 
            onClick={() => setIsEditing(false)}
            className="flex-1 py-3 bg-zinc-800 text-zinc-300 rounded-xl text-xs font-bold uppercase transition-all"
          >
            Concluído
          </button>
        </div>
      )}
    </div>
  );
};
