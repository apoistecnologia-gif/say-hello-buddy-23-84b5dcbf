import React, { createContext, useContext, useState, useEffect } from "react";
import { useRoute } from "@/hooks/use-route";
import { useRideCategories } from "@/hooks/use-ride-categories";
import { FareEstimate, ServiceDetails } from "@/types/pricing";

interface PricingContextType {
  estimate: FareEstimate | null;
  status: "idle" | "loading" | "success" | "error";
  error: string | null;
  serviceDetails: ServiceDetails;
  setServiceDetails: (details: ServiceDetails) => void;
}

const PricingContext = createContext<PricingContextType | undefined>(undefined);

export const PricingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { route } = useRoute();
  const { selectedCategory } = useRideCategories();
  const [estimate, setEstimate] = useState<FareEstimate | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [serviceDetails, setServiceDetails] = useState<ServiceDetails>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (route && selectedCategory) {
      setStatus("loading");
      const baseFare = 5.0;
      const distKm = route.distanceMeters / 1000;
      const durMin = route.durationSeconds / 60;
      const total = baseFare + (distKm * 2.5) + (durMin * 0.5);
      
      setEstimate({
        category_key: selectedCategory.key,
        total: Math.max(total, 7.0),
        base_fare: baseFare,
        distance_fare: distKm * 2.5,
        duration_fare: durMin * 0.5,
        min_fare: 7.0
      });
      setStatus("success");
      setError(null);
    } else {
      setEstimate(null);
      setStatus("idle");
    }
  }, [route, selectedCategory, serviceDetails]);

  return (
    <PricingContext.Provider value={{ 
      estimate, 
      status, 
      error,
      serviceDetails,
      setServiceDetails
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
