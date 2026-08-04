import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useRoute } from "@/hooks/use-route";
import { useRideCategories } from "@/hooks/use-ride-categories";
import { FareEstimate, PricingRequest } from "@/types/pricing";
import { pricingService } from "@/services/pricing/pricing-service";
import { useRideStops } from "@/hooks/rides/use-ride-stops";

interface PricingContextType {
  estimates: FareEstimate[];
  selectedEstimate: FareEstimate | null;
  status: "idle" | "loading" | "success" | "error";
  error: string | null;
  calculatePricing: () => Promise<void>;
}

const PricingContext = createContext<PricingContextType | undefined>(undefined);

export const PricingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { route, origin, destination } = useRoute();
  const { selectedCategory, categories } = useRideCategories();
  const { stops } = useRideStops();
  const [estimates, setEstimates] = useState<FareEstimate[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  
  const lastRequestRef = useRef<string>("");
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const calculatePricing = useCallback(async () => {
    if (!route || !origin || !destination) {
      setEstimates([]);
      setStatus("idle");
      return;
    }

    const request: PricingRequest = {
      routeId: route.routeId,
      origin: { latitude: origin.latitude, longitude: origin.longitude },
      destination: { latitude: destination.latitude, longitude: destination.longitude },
      stops: stops.map(s => ({ latitude: s.latitude, longitude: s.longitude })),
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      categoryIds: categories.map(c => c.id)
    };

    const requestStr = JSON.stringify(request);
    if (requestStr === lastRequestRef.current) return;
    lastRequestRef.current = requestStr;

    setStatus("loading");
    setError(null);

    try {
      const response = await pricingService.estimateFares(request);
      setEstimates(response.estimates);
      setStatus("success");
    } catch (err) {
      console.error("[PricingProvider] Error calculating pricing:", err);
      setError("Não foi possível calcular os valores agora.");
      setStatus("error");
    }
  }, [route, origin, destination, stops, categories]);

  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    
    debounceTimerRef.current = setTimeout(() => {
      calculatePricing();
    }, 500);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [calculatePricing]);

  const selectedEstimate = estimates.find(e => e.categoryId === selectedCategory?.id) || null;

  return (
    <PricingContext.Provider value={{ 
      estimates, 
      selectedEstimate,
      status, 
      error,
      calculatePricing
    }}>
      {children}
    </PricingContext.Provider>
  );
};

export const usePricing = () => {
  const context = useContext(PricingContext);
  if (!context) throw new Error("usePricing must be used within PricingProvider");
  return context;
};
