import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
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
  isFrozen: boolean;
  clearRoute: () => void;
  refresh: () => Promise<void>;
  retry: () => Promise<void>;
  freeze: () => void;
  unfreeze: () => void;
}

const RouteContext = createContext<RouteContextType | undefined>(undefined);

function haversineMeters(a: RouteCoordinates, b: RouteCoordinates) {
  const R = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const q =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(q)));
}

export const RouteProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { location } = useLocation();
  const { destination } = useDestination();
  const { orderedStops } = useRideStops();
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [status, setStatus] = useState<RouteStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isFrozen, setIsFrozen] = useState(false);
  const lastInputRef = useRef<{
    origin: RouteCoordinates;
    destination: RouteCoordinates;
    stopsKey: string;
  } | null>(null);

  const calculateRoute = useCallback(async (force = false) => {
    if (!location || !destination) {
      setRoute(null);
      setStatus("idle");
      lastInputRef.current = null;
      return;
    }

    const originCoord: RouteCoordinates = { lat: location.latitude, lng: location.longitude };
    const destCoord: RouteCoordinates = { lat: destination.latitude, lng: destination.longitude };
    const intermediates: RouteCoordinates[] = orderedStops.map((s) => ({
      lat: s.latitude,
      lng: s.longitude,
    }));
    const stopsKey = JSON.stringify(intermediates);

    const previous = lastInputRef.current;
    const sameDestination =
      previous &&
      previous.destination.lat === destCoord.lat &&
      previous.destination.lng === destCoord.lng &&
      previous.stopsKey === stopsKey;

    // GPS pode oscilar alguns metros mesmo com o passageiro parado. Não refazemos
    // rota/preço por essa oscilação, evitando o painel "pular" sozinho.
    if (!force && sameDestination && haversineMeters(previous.origin, originCoord) < 50) {
      return;
    }

    try {
      setStatus("loading");

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

      let decodedPoints: RouteCoordinates[] = [];
      try {
        decodedPoints = PolylineDecoder.decode(response.encodedPolyline);
      } catch {
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

      lastInputRef.current = {
        origin: originCoord,
        destination: destCoord,
        stopsKey,
      };
      setRoute(newRoute);
      setStatus("success");
      setError(null);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Falha ao calcular rota";
      setError(message);
      setStatus("failed");
    }
  }, [location, destination, orderedStops]);

  useEffect(() => {
    if (isFrozen) return;
    const timer = window.setTimeout(() => {
      void calculateRoute(false);
    }, 500);
    setStatus((current) => (current === "success" ? current : "debouncing"));
    return () => window.clearTimeout(timer);
  }, [calculateRoute, isFrozen]);

  const clearRoute = useCallback(() => {
    setIsFrozen(false);
    lastInputRef.current = null;
    setRoute(null);
    setError(null);
    setStatus("idle");
  }, []);

  return (
    <RouteContext.Provider
      value={{
        route,
        status,
        isLoading: status === "loading",
        error,
        isStale: status === "stale",
        isFrozen,
        clearRoute,
        refresh: () => calculateRoute(true),
        retry: () => calculateRoute(true),
        freeze: () => setIsFrozen(true),
        unfreeze: () => setIsFrozen(false),
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