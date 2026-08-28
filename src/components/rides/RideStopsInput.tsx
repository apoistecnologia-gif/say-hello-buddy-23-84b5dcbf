import { AnimatePresence, Reorder } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import { GripVertical, MapPin, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useRideStops } from "@/hooks/rides/use-ride-stops";
import { useDestination } from "@/hooks/use-destination";
import { usePickupAddress } from "@/hooks/use-pickup-address";

export function RideStopsInput() {
  const {
    stops,
    orderedStops,
    canAddStop,
    removeStop,
    reorderStops,
    confirmStops,
    cancelEditing,
    isEditing,
  } = useRideStops();

  const { pickupLabel } = usePickupAddress();
  const { destination } = useDestination();
  const navigate = useNavigate();

  const openStopSearch = () => {
    void navigate({ to: "/buscar-destino", search: { stop: true } });
  };

  const saveStops = () => {
    try {
      confirmStops();
      toast.success(
        orderedStops.length === 0
          ? "Trajeto salvo sem paradas intermediárias."
          : `${orderedStops.length} parada${orderedStops.length === 1 ? "" : "s"} salva${orderedStops.length === 1 ? "" : "s"}.`,
      );
    } catch (caughtError: unknown) {
      toast.error(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível salvar as paradas.",
      );
    }
  };

  if (!isEditing && stops.length === 0) {
    return (
      <div className="px-4 py-2">
        <button
          type="button"
          onClick={openStopSearch}
          className="app-pressable flex min-h-10 items-center gap-2 rounded-lg border border-apois-yellow/20 bg-apois-yellow/10 px-3 py-2 text-xs font-bold text-apois-yellow"
        >
          <Plus size={14} />
          Adicionar parada
        </button>
      </div>
    );
  }

  return (
    <section className="space-y-4 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
          Seu trajeto
        </h3>
        {canAddStop ? (
          <button
            type="button"
            onClick={openStopSearch}
            className="app-pressable flex min-h-9 items-center gap-1 rounded-lg px-2 text-[10px] font-bold uppercase tracking-wider text-apois-yellow"
          >
            <Plus size={12} />
            Nova parada
          </button>
        ) : (
          <span className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
            Limite de 3 paradas
          </span>
        )}
      </div>

      <div className="relative space-y-3">
        <div className="absolute bottom-4 left-[15px] top-4 w-0.5 border-l border-dashed border-zinc-700" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-blue-500/30 bg-zinc-900">
            <div className="h-2 w-2 rounded-full bg-blue-500" />
          </div>
          <div className="min-w-0 flex-1 rounded-xl border border-white/5 bg-zinc-900/50 px-3 py-2 opacity-70">
            <p className="text-[10px] font-bold uppercase tracking-tighter text-zinc-600">
              Partida
            </p>
            <p className="truncate text-xs font-medium text-zinc-400">
              {pickupLabel || "Minha localização"}
            </p>
          </div>
        </div>

        <Reorder.Group
          axis="y"
          values={orderedStops}
          onReorder={reorderStops}
          className="space-y-3"
        >
          <AnimatePresence initial={false}>
            {orderedStops.map((stop, index) => (
              <Reorder.Item
                key={stop.id}
                value={stop}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="relative z-10 flex items-center gap-3"
              >
                <div className="flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 shadow-lg active:cursor-grabbing">
                  <span className="text-[10px] font-black text-white">{index + 1}</span>
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-zinc-800 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-tighter text-zinc-500">
                      Parada {index + 1}
                    </p>
                    <p className="truncate text-xs font-bold text-white">{stop.label}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeStop(stop.id)}
                    aria-label={`Remover parada ${index + 1}`}
                    className="app-pressable flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:text-red-400"
                  >
                    <X size={15} />
                  </button>
                  <GripVertical aria-hidden="true" size={16} className="text-zinc-600" />
                </div>
              </Reorder.Item>
            ))}
          </AnimatePresence>
        </Reorder.Group>

        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-yellow-500/30 bg-zinc-900">
            <MapPin size={14} className="text-yellow-500" />
          </div>
          <div className="min-w-0 flex-1 rounded-xl border border-white/5 bg-zinc-900/50 px-3 py-2 opacity-80">
            <p className="text-[10px] font-bold uppercase tracking-tighter text-zinc-500">
              Destino
            </p>
            <p className="truncate text-xs font-bold text-white">
              {destination?.label || "Destino não selecionado"}
            </p>
          </div>
        </div>
      </div>

      {isEditing ? (
        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            type="button"
            onClick={cancelEditing}
            className="app-pressable min-h-12 rounded-xl border border-white/10 bg-zinc-900 text-xs font-bold uppercase text-zinc-400"
          >
            Descartar
          </button>
          <button
            type="button"
            onClick={saveStops}
            className="app-pressable min-h-12 rounded-xl bg-apois-yellow text-xs font-black uppercase text-black"
          >
            Salvar paradas
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={openStopSearch}
          disabled={!canAddStop}
          className="app-pressable min-h-11 w-full rounded-xl border border-white/8 bg-zinc-900 text-xs font-bold text-zinc-400 disabled:opacity-40"
        >
          {canAddStop ? "Adicionar outra parada" : "Limite de paradas atingido"}
        </button>
      )}
    </section>
  );
}
