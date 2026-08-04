import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { 
  FareEstimate, 
  ServiceDetails, 
  PricingStatus, 
  PricingError,
  RideCategoryKey
} from "@/types/pricing";
import { pricingService } from "@/services/pricing/pricing-service";
import { useRoute } from "@/hooks/use-route";
import { useRideCategories } from "@/hooks/use-ride-categories";
import { supabase } from "@/integrations/supabase/client";

interface PricingContextType {
  estimate: FareEstimate | null;
  serviceDetails: ServiceDetails;
  status: PricingStatus;
  error: PricingError | null;
  setServiceDetails: (details: ServiceDetails) => void;
  resetServiceDetails: () => void;
  recalculate: () => void;
  clearEstimate: () => void;
}

const PricingContext = createContext<PricingContextType | undefined>(undefined);

export const PricingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { route, status: routeStatus } = useRoute();
  const { selectedCategory } = useRideCategories();
  const [serviceDetails, setServiceDetails] = useState<ServiceDetails>(null);
  const [estimate, setEstimate] = useState<FareEstimate | null>(null);
  const [status, setStatus] = useState<PricingStatus>("idle");
  const [error, setError] = useState<PricingError | null>(null);

  const loadTariffs = useCallback(async () => {
    try {
      await pricingService.loadTariffs();
    } catch (err) {
      setError("tariff_load_failed");
    }
  }, []);

  useEffect(() => {
    loadTariffs();
    
    const channel = supabase
      .channel("tariff_rules_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tariff_rules" },
        () => {
          pricingService.clearCache();
          loadTariffs().then(() => recalculate());
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadTariffs]);

  const recalculate = useCallback(() => {
    if (!selectedCategory) {
      setEstimate(null);
      setStatus("idle");
      return;
    }

    if (routeStatus !== "success" || !route) {
      setEstimate(null);
      setStatus("unavailable");
      setError("route_required");
      return;
    }

    try {
      setStatus("loading");
      const result = pricingService.estimateFare(selectedCategory.key, route, serviceDetails);
      setEstimate(result);
      setStatus("success");
      setError(null);
    } catch (err: any) {
      setError(err.message as PricingError);
      setStatus("failed");
      setEstimate(null);
    }
  }, [selectedCategory, route, routeStatus, serviceDetails]);

  useEffect(() => {
    recalculate();
  }, [recalculate]);

  const clearEstimate = () => {
    setEstimate(null);
    setStatus("idle");
    setError(null);
  };

  const resetServiceDetails = () => setServiceDetails(null);

  return (
    <PricingContext.Provider
      value={{
        estimate,
        serviceDetails,
        status,
        error,
        setServiceDetails,
        resetServiceDetails,
        recalculate,
        clearEstimate,
      }}
    >
      {children}
    </PricingContext.Provider>
  );
};

export const usePricing = () => {
  const context = useContext(PricingContext);
  if (!context) throw new Error("usePricing must be used within PricingProvider");
  return context;
};
