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
  isRecovering: boolean;
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

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}

const ActiveRideContext = createContext<ActiveRideContextType | undefined>(undefined);

export const ActiveRideProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [ride, setRide] = useState<ActiveRide | null>(null);
  const [screenState, setScreenState] = useState<RideScreenState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastUpdateAt, setLastUpdateAt] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);

  const currentRideIdRef = useRef<string | null>(null);
  const requestSequenceRef = useRef(0);
  const recoveryPromiseRef = useRef<Promise<string | null> | null>(null);

  const clearRide = useCallback(() => {
    requestSequenceRef.current += 1;
    recoveryPromiseRef.current = null;
    void activeRideService.unsubscribe();
    setRide(null);
    setScreenState("idle");
    setError(null);
    setLastUpdateAt(null);
    setIsRefreshing(false);
    setIsRecovering(false);
    setIsRealtimeConnected(false);
    currentRideIdRef.current = null;
  }, []);

  const handleUpdate = useCallback((updatedRide: ActiveRide) => {
    if (currentRideIdRef.current && updatedRide.id !== currentRideIdRef.current) return;

    setRide(updatedRide);
    setLastUpdateAt(new Date());

    if (updatedRide.status === "finalizada") {
      setScreenState("completed");
      setIsRealtimeConnected(false);
    } else if (updatedRide.status.startsWith("cancelada")) {
      setScreenState("cancelled");
      setIsRealtimeConnected(false);
    } else {
      setScreenState("active");
    }
  }, []);

  const loadRide = useCallback(
    async (rideId: string) => {
      if (!userId || !rideId.trim()) return;

      const requestId = ++requestSequenceRef.current;
      setIsRefreshing(true);
      setScreenState((current) => (current === "idle" ? "loading" : current));

      try {
        const data = await activeRideService.getRideById(rideId, userId);
        if (requestId !== requestSequenceRef.current) return;

        currentRideIdRef.current = rideId;
        setRide(data);
        setLastUpdateAt(new Date());

        if (data.status === "finalizada") {
          setScreenState("completed");
          setIsRealtimeConnected(false);
          void activeRideService.unsubscribe();
        } else if (data.status.startsWith("cancelada")) {
          setScreenState("cancelled");
          setIsRealtimeConnected(false);
          void activeRideService.unsubscribe();
        } else {
          setScreenState("active");
          activeRideService.subscribeToRide(rideId, handleUpdate, setIsRealtimeConnected);
        }

        setError(null);
      } catch (caughtError: unknown) {
        if (requestId !== requestSequenceRef.current) return;

        const message = readErrorMessage(caughtError);
        console.error("[useActiveRide] Error loading ride:", caughtError);
        setIsRealtimeConnected(false);

        if (message === "not_found") setScreenState("not_found");
        else if (message === "unauthorized") setScreenState("unauthorized");
        else {
          setScreenState("failed");
          setError("Não foi possível carregar os dados da corrida.");
        }
      } finally {
        if (requestId === requestSequenceRef.current) setIsRefreshing(false);
      }
    },
    [handleUpdate, userId],
  );

  const refreshRide = useCallback(async () => {
    if (currentRideIdRef.current) await loadRide(currentRideIdRef.current);
  }, [loadRide]);

  const recoverActiveRide = useCallback(async (): Promise<string | null> => {
    if (!userId) return null;
    if (recoveryPromiseRef.current) return recoveryPromiseRef.current;

    const recovery = (async () => {
      setIsRecovering(true);
      try {
        const activeRide = await activeRideService.getActiveRide(userId);
        if (!activeRide) {
          if (!currentRideIdRef.current) {
            setRide(null);
            setScreenState("idle");
            setError(null);
          }
          return null;
        }

        if (currentRideIdRef.current !== activeRide.id || ride?.id !== activeRide.id) {
          await loadRide(activeRide.id);
        } else if (!isRealtimeConnected) {
          activeRideService.subscribeToRide(activeRide.id, handleUpdate, setIsRealtimeConnected);
        }

        return activeRide.id;
      } catch (caughtError: unknown) {
        console.error("[useActiveRide] Recovery error:", caughtError);
        return null;
      } finally {
        setIsRecovering(false);
        recoveryPromiseRef.current = null;
      }
    })();

    recoveryPromiseRef.current = recovery;
    return recovery;
  }, [handleUpdate, isRealtimeConnected, loadRide, ride?.id, userId]);

  const retry = useCallback(() => {
    if (currentRideIdRef.current) void loadRide(currentRideIdRef.current);
    else void recoverActiveRide();
  }, [loadRide, recoverActiveRide]);

  useEffect(() => {
    if (!userId) {
      clearRide();
      return;
    }

    void recoverActiveRide();
  }, [clearRide, recoverActiveRide, userId]);

  useEffect(() => {
    if (!userId) return;

    const handleOnline = () => {
      void recoverActiveRide();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void recoverActiveRide();
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [recoverActiveRide, userId]);

  useEffect(() => {
    return () => {
      requestSequenceRef.current += 1;
      void activeRideService.unsubscribe();
    };
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
        isRecovering,
        isRealtimeConnected,
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
