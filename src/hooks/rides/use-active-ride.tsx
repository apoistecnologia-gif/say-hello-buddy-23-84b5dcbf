import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import {
  ActiveRide,
  RideStatus,
  RideScreenState,
  RideActionAvailability,
} from "@/types/rides/active-ride";
import { activeRideService } from "@/services/rides/active-ride-service";
import { useAuth } from "@/hooks/use-auth";

interface ActiveRideContextType {
  ride: ActiveRide | null;
  status: RideStatus | null;
  screenState: RideScreenState;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  isRealtimeConnected: boolean;
  lastUpdateAt: Date | null;
  error: string | null;
  actionAvailability: RideActionAvailability | null;
  loadRide: (rideId: string) => Promise<void>;
  refreshRide: () => Promise<void>;
  clearRide: () => void;
  retry: () => void;
  recoverActiveRide: () => Promise<string | null>;
}

const ActiveRideContext = createContext<ActiveRideContextType | undefined>(undefined);

export const ActiveRideProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [ride, setRide] = useState<ActiveRide | null>(null);
  const [screenState, setScreenState] = useState<RideScreenState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastUpdateAt, setLastUpdateAt] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const currentRideIdRef = useRef<string | null>(null);

  const clearRide = useCallback(() => {
    activeRideService.unsubscribe();
    setRide(null);
    setScreenState("idle");
    setError(null);
    currentRideIdRef.current = null;
  }, []);

  const handleUpdate = useCallback((updatedRide: ActiveRide) => {
    setRide(updatedRide);
    setLastUpdateAt(new Date());

    // Update screen state based on status
    if (updatedRide.status === "finalizada") setScreenState("completed");
    else if (updatedRide.status.startsWith("cancelada")) setScreenState("cancelled");
    else setScreenState("active");
  }, []);

  const loadRide = useCallback(
    async (rideId: string) => {
      if (!user) return;

      setIsRefreshing(true);
      if (screenState === "idle") setScreenState("loading");

      try {
        const data = await activeRideService.getRideById(rideId, user.id);
        currentRideIdRef.current = rideId;
        setRide(data);
        setLastUpdateAt(new Date());

        if (data.status === "finalizada") setScreenState("completed");
        else if (data.status.startsWith("cancelada")) setScreenState("cancelled");
        else {
          setScreenState("active");
          activeRideService.subscribeToRide(rideId, handleUpdate);
        }

        setError(null);
      } catch (err: any) {
        console.error("[useActiveRide] Error loading ride:", err);
        if (err.message === "not_found") setScreenState("not_found");
        else if (err.message === "unauthorized") setScreenState("unauthorized");
        else {
          setScreenState("failed");
          setError("Não foi possível carregar os dados da corrida.");
        }
      } finally {
        setIsRefreshing(false);
      }
    },
    [user, screenState, handleUpdate],
  );

  const refreshRide = useCallback(async () => {
    if (currentRideIdRef.current) {
      await loadRide(currentRideIdRef.current);
    }
  }, [loadRide]);

  const recoverActiveRide = useCallback(async () => {
    if (!user) return null;
    try {
      const activeRide = await activeRideService.getActiveRide(user.id);
      return activeRide ? activeRide.id : null;
    } catch (err) {
      console.error("[useActiveRide] Recovery error:", err);
      return null;
    }
  }, [user]);

  const retry = useCallback(() => {
    if (currentRideIdRef.current) loadRide(currentRideIdRef.current);
  }, [loadRide, currentRideIdRef]);

  // Clean up on unmount
  useEffect(() => {
    return () => activeRideService.unsubscribe();
  }, []);

  const actionAvailability = ride
    ? activeRideService.getActionAvailability(ride.status, ride)
    : null;

  return (
    <ActiveRideContext.Provider
      value={{
        ride,
        status: ride?.status || null,
        screenState,
        isInitialLoading: screenState === "loading",
        isRefreshing,
        isRealtimeConnected: !!ride, // Simplified
        lastUpdateAt,
        error,
        actionAvailability,
        loadRide,
        refreshRide,
        clearRide,
        retry,
        recoverActiveRide,
      }}
    >
      {children}
    </ActiveRideContext.Provider>
  );
};

export const useActiveRide = () => {
  const context = useContext(ActiveRideContext);
  if (!context) throw new Error("useActiveRide must be used within ActiveRideProvider");
  return context;
};
