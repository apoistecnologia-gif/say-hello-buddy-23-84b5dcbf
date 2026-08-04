import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { RideStop, RideStopId } from "@/types/rides/stops";
import { useDestination } from "@/hooks/use-destination";
import { useLocation } from "@/hooks/use-location";
import { v4 as uuidv4 } from "uuid";

interface RideStopsContextType {
  stops: RideStop[];
  orderedStops: RideStop[];
  canAddStop: boolean;
  addStop: (stop: Omit<RideStop, "id" | "order" | "createdAt" | "updatedAt">) => void;
  updateStop: (id: RideStopId, updates: Partial<RideStop>) => void;
  removeStop: (id: RideStopId) => void;
  reorderStops: (newStops: RideStop[]) => void;
  clearStops: () => void;
  validateStops: () => string | null;
  confirmStops: () => void;
  cancelEditing: () => void;
  isEditing: boolean;
  setIsEditing: (val: boolean) => void;
}

const MAX_STOPS = 3;

const RideStopsContext = createContext<RideStopsContextType | undefined>(undefined);

export const RideStopsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [stops, setStops] = useState<RideStop[]>([]);
  const [tempStops, setTempStops] = useState<RideStop[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const { destination } = useDestination();
  const { location } = useLocation();

  const orderedStops = useMemo(() => {
    return [...(isEditing ? tempStops : stops)].sort((a, b) => a.order - b.order);
  }, [stops, tempStops, isEditing]);

  const canAddStop = orderedStops.length < MAX_STOPS;

  const validateStops = useCallback(() => {
    const current = isEditing ? tempStops : stops;

    // Check duplicates
    const placeIds = new Set();
    for (const stop of current) {
      if (!stop.placeId) return "Todas as paradas precisam de um local selecionado.";
      if (placeIds.has(stop.placeId)) return "Você não pode adicionar a mesma parada duas vezes.";
      placeIds.add(stop.placeId);

      if (destination && stop.placeId === destination.placeId)
        return "Uma parada não pode ser igual ao destino.";
      // In a real app we'd check origin too, but origin often doesn't have a placeId from GPS
    }

    return null;
  }, [stops, tempStops, isEditing, destination]);

  const addStop = useCallback(
    (stopData: Omit<RideStop, "id" | "order" | "createdAt" | "updatedAt">) => {
      if (!canAddStop) return;

      const newStop: RideStop = {
        ...stopData,
        id: uuidv4(),
        order: orderedStops.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setTempStops((prev) => [...prev, newStop]);
      if (!isEditing) setIsEditing(true);
    },
    [canAddStop, orderedStops.length, isEditing],
  );

  const updateStop = useCallback((id: RideStopId, updates: Partial<RideStop>) => {
    setTempStops((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s,
      ),
    );
  }, []);

  const removeStop = useCallback((id: RideStopId) => {
    setTempStops((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      return filtered.map((s, index) => ({ ...s, order: index }));
    });
  }, []);

  const reorderStops = useCallback((newStops: RideStop[]) => {
    setTempStops(newStops.map((s, index) => ({ ...s, order: index })));
  }, []);

  const confirmStops = useCallback(() => {
    const error = validateStops();
    if (error) throw new Error(error);

    setStops(tempStops);
    setIsEditing(false);
  }, [tempStops, validateStops]);

  const cancelEditing = useCallback(() => {
    setTempStops(stops);
    setIsEditing(false);
  }, [stops]);

  const clearStops = useCallback(() => {
    setStops([]);
    setTempStops([]);
    setIsEditing(false);
  }, []);

  return (
    <RideStopsContext.Provider
      value={{
        stops,
        orderedStops,
        canAddStop,
        addStop,
        updateStop,
        removeStop,
        reorderStops,
        clearStops,
        validateStops,
        confirmStops,
        cancelEditing,
        isEditing,
        setIsEditing,
      }}
    >
      {children}
    </RideStopsContext.Provider>
  );
};

export const useRideStops = () => {
  const context = useContext(RideStopsContext);
  if (!context) throw new Error("useRideStops must be used within RideStopsProvider");
  return context;
};
