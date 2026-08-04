import React, { createContext, useContext, useState, useEffect } from "react";
import { useLocation } from "@/hooks/use-location";
import { useDestination } from "@/hooks/use-destination";

interface RouteData {
  distanceMeters: number;
  durationSeconds: number;
  polyline: string;
}

interface RouteContextType {
  route: RouteData | null;
  status: "idle" | "loading" | "success" | "error";
  clearRoute: () => void;
}

const RouteContext = createContext<RouteContextType | undefined>(undefined);

export const RouteProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { location } = useLocation();
  const { destination } = useDestination();
  const [route, setRoute] = useState<RouteData | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  useEffect(() => {
    if (location && destination) {
      setStatus("loading");
      // Simulated route calculation (matches STO-008)
      setRoute({
        distanceMeters: 5000,
        durationSeconds: 600,
        polyline: "mock_polyline"
      });
      setStatus("success");
    } else {
      setRoute(null);
      setStatus("idle");
    }
  }, [location, destination]);

  return (
    <RouteContext.Provider value={{ route, status, clearRoute: () => setRoute(null) }}>
      {children}
    </RouteContext.Provider>
  );
};

export const useRoute = () => {
  const context = useContext(RouteContext);
  if (!context) throw new Error("useRoute must be used within RouteProvider");
  return context;
};
