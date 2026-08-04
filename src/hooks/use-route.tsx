import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useLocation } from "@/hooks/use-location";
import { useDestination } from "@/hooks/use-destination";

export interface RouteData {
  distanceMeters: number;
  durationSeconds: number;
  polyline: string;
  decodedPoints?: Array<{lat: number, lng: number}>;
}

interface RouteContextType {
  route: RouteData | null;
  status: "idle" | "loading" | "success" | "error" | "debouncing";
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
  const [route, setRoute] = useState<RouteData | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error" | "debouncing">("idle");
  const [error, setError] = useState<string | null>(null);

  const calculateRoute = useCallback(async () => {
    if (!location || !destination) {
      setRoute(null);
      setStatus("idle");
      return;
    }

    try {
      setStatus("loading");
      // Simulated route calculation (matches STO-008)
      setRoute({
        distanceMeters: 5000,
        durationSeconds: 600,
        polyline: "mock_polyline",
        decodedPoints: [
          {lat: location.latitude, lng: location.longitude},
          {lat: destination.latitude, lng: destination.longitude}
        ]
      });
      setStatus("success");
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to calculate route");
      setStatus("error");
    }
  }, [location, destination]);

  useEffect(() => {
    calculateRoute();
  }, [calculateRoute]);

  return (
    <RouteContext.Provider value={{ 
      route, 
      status, 
      isLoading: status === "loading",
      error,
      isStale: false,
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
