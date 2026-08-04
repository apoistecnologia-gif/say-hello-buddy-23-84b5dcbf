import React, { createContext, useContext, useState, useEffect } from "react";
import { useRoute } from "@/hooks/use-route";
import { useRideCategories } from "@/hooks/use-ride-categories";
import { FareEstimate } from "@/types/pricing";

interface PricingContextType {
  estimate: FareEstimate | null;
  status: "idle" | "loading" | "success" | "error";
}

const PricingContext = createContext<PricingContextType | undefined>(undefined);

export const PricingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { route } = useRoute();
  const { selectedCategory } = useRideCategories();
  const [estimate, setEstimate] = useState<FareEstimate | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  useEffect(() => {
    if (route && selectedCategory) {
      setStatus("loading");
      // Simulated pricing logic (matches STO-009)
      const baseFare = 5.0;
      const distKm = route.distanceMeters / 1000;
      const durMin = route.durationSeconds / 60;
      const total = baseFare + (distKm * 2.5) + (durMin * 0.5);
      
      setEstimate({
        category: selectedCategory.key,
        baseFare,
        perKm: 2.5,
        perMin: 0.5,
        distanceKm: distKm,
        durationMin: durMin,
        extrasTotal: 0,
        minFare: 7.0,
        estimatedTotal: Math.max(total, 7.0)
      });
      setStatus("success");
    } else {
      setEstimate(null);
      setStatus("idle");
    }
  }, [route, selectedCategory]);

  return (
    <PricingContext.Provider value={{ estimate, status }}>
      {children}
    </PricingContext.Provider>
  );
};

export const usePricing = () => {
  const context = useContext(PricingContext);
  if (!context) throw new Error("usePricing must be used within PricingProvider");
  return context;
};
