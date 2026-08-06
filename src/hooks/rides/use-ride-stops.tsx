import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import { useDestination } from "@/hooks/use-destination";
import type { RideStop, RideStopId } from "@/types/rides/stops";

interface RestorableRideStop {
  latitude: number;
  longitude: number;
  label: string;
  formattedAddress: string;
  placeId: string;
  subLabel?: string;
  source?: RideStop["source"];
}

interface RideStopsContextType {
  stops: RideStop[];
  orderedStops: RideStop[];
  canAddStop: boolean;
  addStop: (stop: Omit<RideStop, "id" | "order" | "createdAt" | "updatedAt">) => void;
  updateStop: (id: RideStopId, updates: Partial<RideStop>) => void;
  removeStop: (id: RideStopId) => void;
  reorderStops: (newStops: RideStop[]) => void;
  clearStops: () => void;
  restoreStops: (items: RestorableRideStop[]) => void;
  validateStops: () => string | null;
  confirmStops: () => void;
  cancelEditing: () => void;
  isEditing: boolean;
  setIsEditing: (value: boolean) => void;
}

const MAX_STOPS = 3;
const RideStopsContext = createContext<RideStopsContextType | undefined>(undefined);

export const RideStopsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [stops, setStops] = useState<RideStop[]>([]);
  const [tempStops, setTempStops] = useState<RideStop[]>([]);
  const [isEditing, setIsEditingState] = useState(false);
  const { destination } = useDestination();

  const orderedStops = useMemo(
    () => [...(isEditing ? tempStops : stops)].sort((a, b) => a.order - b.order),
    [isEditing, stops, tempStops],
  );

  const canAddStop = orderedStops.length < MAX_STOPS;

  const validateStops = useCallback(() => {
    const current = isEditing ? tempStops : stops;
    const placeIds = new Set<string>();

    for (const stop of current) {
      if (!stop.placeId.trim()) return "Todas as paradas precisam de um local selecionado.";
      if (!Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude)) {
        return "Uma das paradas possui localização inválida.";
      }
      if (placeIds.has(stop.placeId)) {
        return "Você não pode adicionar a mesma parada duas vezes.";
      }
      placeIds.add(stop.placeId);

      if (destination && stop.placeId === destination.placeId) {
        return "Uma parada não pode ser igual ao destino.";
      }
    }

    return null;
  }, [destination, isEditing, stops, tempStops]);

  const addStop = useCallback(
    (stopData: Omit<RideStop, "id" | "order" | "createdAt" | "updatedAt">) => {
      const baseStops = isEditing ? tempStops : stops;
      const placeId = stopData.placeId.trim();

      if (baseStops.length >= MAX_STOPS) {
        toast.error("Você já adicionou o limite de três paradas.");
        return;
      }
      if (!placeId || !Number.isFinite(stopData.latitude) || !Number.isFinite(stopData.longitude)) {
        toast.error("O local selecionado não possui uma localização válida.");
        return;
      }
      if (baseStops.some((stop) => stop.placeId === placeId)) {
        toast.error("Esta parada já foi adicionada ao trajeto.");
        return;
      }
      if (destination?.placeId === placeId) {
        toast.error("A parada não pode ser igual ao destino final.");
        return;
      }

      const timestamp = new Date().toISOString();
      const newStop: RideStop = {
        ...stopData,
        placeId,
        id: uuidv4(),
        order: baseStops.length,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      setTempStops([...baseStops, newStop]);
      setIsEditingState(true);
    },
    [destination?.placeId, isEditing, stops, tempStops],
  );

  const updateStop = useCallback((id: RideStopId, updates: Partial<RideStop>) => {
    setTempStops((current) =>
      current.map((stop) =>
        stop.id === id
          ? { ...stop, ...updates, updatedAt: new Date().toISOString() }
          : stop,
      ),
    );
  }, []);

  const removeStop = useCallback((id: RideStopId) => {
    setTempStops((current) =>
      current
        .filter((stop) => stop.id !== id)
        .map((stop, index) => ({ ...stop, order: index })),
    );
  }, []);

  const reorderStops = useCallback((newStops: RideStop[]) => {
    setTempStops(
      newStops.map((stop, index) => ({
        ...stop,
        order: index,
        updatedAt: new Date().toISOString(),
      })),
    );
  }, []);

  const confirmStops = useCallback(() => {
    const validationError = validateStops();
    if (validationError) throw new Error(validationError);

    const confirmedStops = tempStops.map((stop, index) => ({ ...stop, order: index }));
    setStops(confirmedStops);
    setTempStops(confirmedStops);
    setIsEditingState(false);
  }, [tempStops, validateStops]);

  const cancelEditing = useCallback(() => {
    setTempStops(stops);
    setIsEditingState(false);
  }, [stops]);

  const clearStops = useCallback(() => {
    setStops([]);
    setTempStops([]);
    setIsEditingState(false);
  }, []);

  const restoreStops = useCallback((items: RestorableRideStop[]) => {
    const timestamp = new Date().toISOString();
    const seenPlaceIds = new Set<string>();
    const restored = items
      .filter((item) => {
        const placeId = item.placeId.trim();
        if (
          !placeId ||
          seenPlaceIds.has(placeId) ||
          !Number.isFinite(item.latitude) ||
          !Number.isFinite(item.longitude)
        ) {
          return false;
        }
        seenPlaceIds.add(placeId);
        return true;
      })
      .slice(0, MAX_STOPS)
      .map((item, index): RideStop => ({
        id: uuidv4(),
        order: index,
        latitude: item.latitude,
        longitude: item.longitude,
        label: item.label,
        subLabel: item.subLabel ?? item.formattedAddress,
        formattedAddress: item.formattedAddress,
        placeId: item.placeId.trim(),
        source: item.source ?? "recent",
        createdAt: timestamp,
        updatedAt: timestamp,
      }));

    setStops(restored);
    setTempStops(restored);
    setIsEditingState(false);
  }, []);

  const setIsEditing = useCallback(
    (value: boolean) => {
      setTempStops(stops);
      setIsEditingState(value);
    },
    [stops],
  );

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
        restoreStops,
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
