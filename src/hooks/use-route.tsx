import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useLocation } from "@/hooks/use-location";
import { useDestination } from "@/hooks/use-destination";
import { useRideStops } from "@/hooks/rides/use-ride-stops";
import { routeService } from "@/services/routes/route-service";
import { PolylineDecoder } from "@/services/routes/polyline-decoder";
import { RouteResult, RouteStatus, RouteCoordinates } from "@/types/routes";

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
  const { orderedStops } = useRideStops();
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

      const originCoord: RouteCoordinates = { lat: location.latitude, lng: location.longitude };
      const destCoord: RouteCoordinates = { lat: destination.latitude, lng: destination.longitude };
      const intermediates: RouteCoordinates[] = orderedStops.map((s) => ({
        lat: s.latitude,
        lng: s.longitude,
      }));

      // Validações básicas
      if (
        !Number.isFinite(originCoord.lat) ||
        !Number.isFinite(originCoord.lng) ||
        !Number.isFinite(destCoord.lat) ||
        !Number.isFinite(destCoord.lng)
      ) {
        throw new Error("Coordenadas inválidas");
      }

      if (originCoord.lat === destCoord.lat && originCoord.lng === destCoord.lng) {
        throw new Error("A origem não pode ser igual ao destino");
      }

      const response = await routeService.computeRoute({
        origin: originCoord,
        destination: destCoord,
        intermediates,
      });

      if (!response.encodedPolyline) {
        throw new Error("Não encontramos uma rota disponível para esse destino.");
      }

      // Decodificação e validação da polyline
      let decodedPoints: RouteCoordinates[] = [];
      try {
        decodedPoints = PolylineDecoder.decode(response.encodedPolyline);
      } catch (err) {
        throw new Error("Não foi possível processar o trajeto da rota.");
      }

      const newRoute: RouteResult = {
        origin: originCoord,
        destination: destCoord,
        intermediates,
        distanceMeters: response.distanceMeters,
        durationSeconds: response.durationSeconds,
        encodedPolyline: response.encodedPolyline,
        decodedPoints,
        steps: response.steps || [],
        calculatedAt: Date.now(),
        source: "apois_backend",
        requestKey: `${originCoord.lat},${originCoord.lng}-${destCoord.lat},${destCoord.lng}`,
      };

      setRoute(newRoute);
      setStatus("success");
      setError(null);
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message || "Falha ao calcular rota");
      setStatus("failed");
    }
  }, [location, destination, orderedStops]);

  useEffect(() => {
    const timer = setTimeout(() => {
      calculateRoute();
    }, 500);
    setStatus("debouncing");
    return () => clearTimeout(timer);
  }, [calculateRoute]);

  return (
    <RouteContext.Provider
      value={{
        route,
        status,
        isLoading: status === "loading",
        error,
        isStale: status === "stale",
        clearRoute: () => setRoute(null),
        refresh: calculateRoute,
        retry: calculateRoute,
      }}
    >
      {children}
    </RouteContext.Provider>
  );
};

export const useRoute = () => {
  const context = useContext(RouteContext);
  if (!context) throw new Error("useRoute must be used within RouteProvider");
  return context;
};
