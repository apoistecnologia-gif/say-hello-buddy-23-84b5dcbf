import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useLocation } from "@/hooks/use-location";
import { useDestination } from "@/hooks/use-destination";
import { useRideStops } from "@/hooks/rides/use-ride-stops";
import { routeService } from "@/services/routes/route-service";
import { RouteResult, RouteStatus } from "@/types/routes";

interface RouteContextType {
  route: RouteResult | null;
  status: RouteStatus;
  isLoading: boolean;
  error: string | null;
  isStale: boolean;
  clearRoute: () => void;
  refresh: () => Promise<void>;
  retry: () => Promise<void>;
}

const RouteContext = createContext<RouteContextType | undefined>(undefined);

export const RouteProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { location } = useLocation();
  const { destination } = useDestination();
  const { stops } = useRideStops();
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [status, setStatus] = useState<RouteStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const calculateRoute = useCallback(async () => {
    if (!location || !destination) {
      setRoute(null);
      setStatus("idle");
      return;
    }

    try {
      setStatus("loading");
      const origin = { lat: location.latitude, lng: location.longitude };
      const dest = { lat: destination.latitude, lng: destination.longitude };
      const intermediates = stops.map(s => ({ lat: s.latitude, lng: s.longitude }));

      const result = await routeService.computeRoute(origin, dest, intermediates);
      setRoute(result);
      setStatus("success");
      setError(null);
    } catch (err: any) {
      if (err.message === 'route_cancelled') return;
      setError(err.message || "Failed to calculate route");
      setStatus("failed");
    }
  }, [location, destination, stops]);

  useEffect(() => {
    const timer = setTimeout(() => {
      calculateRoute();
    }, 500);
    setStatus("debouncing");
    return () => clearTimeout(timer);
  }, [calculateRoute]);

  return (
    <RouteContext.Provider value={{ 
      route, 
      status, 
      isLoading: status === "loading",
      error,
      isStale: status === "stale",
      clearRoute: () => setRoute(null),
      refresh: calculateRoute,
      retry: calculateRoute
    }}>
      {children}
    </RouteContext.Provider>
  );
};

export const useRoute = () => {
  const context = useContext(RouteContext);
  if (!context) throw new Error("useRoute must be used within RouteProvider");
  return context;
};
