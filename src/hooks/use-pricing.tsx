import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRideCategories } from "@/hooks/use-ride-categories";
import { useRoute } from "@/hooks/use-route";
import { useRideStops } from "@/hooks/rides/use-ride-stops";
import { pricingService } from "@/services/pricing/pricing-service";
import type { FareEstimate, PricingRequest, ServiceDetails } from "@/types/pricing";

interface PricingContextType {
  estimates: FareEstimate[];
  selectedEstimate: FareEstimate | null;
  estimate: FareEstimate | null;
  status: "idle" | "loading" | "success" | "error";
  error: string | null;
  serviceDetails: ServiceDetails;
  setServiceDetails: (details: ServiceDetails) => void;
  calculatePricing: () => Promise<void>;
}

const PricingContext = createContext<PricingContextType | undefined>(undefined);

export const PricingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { route } = useRoute();
  const { selectedCategory, categories } = useRideCategories();
  const { orderedStops } = useRideStops();
  const [estimates, setEstimates] = useState<FareEstimate[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [serviceDetails, setServiceDetailsState] = useState<ServiceDetails>({});
  const lastRequestRef = useRef("");
  const debounceTimerRef = useRef<number | null>(null);
  const previousCategoryRef = useRef<string | null>(null);
  const requestSequenceRef = useRef(0);

  const setServiceDetails = useCallback((details: ServiceDetails) => {
    setServiceDetailsState(JSON.parse(JSON.stringify(details)) as ServiceDetails);
    lastRequestRef.current = "";
  }, []);

  useEffect(() => {
    const categoryCode = selectedCategory?.code ?? null;
    if (
      previousCategoryRef.current !== null &&
      previousCategoryRef.current !== categoryCode
    ) {
      setServiceDetailsState({});
      lastRequestRef.current = "";
    }
    previousCategoryRef.current = categoryCode;
  }, [selectedCategory?.code]);

  const calculatePricing = useCallback(async () => {
    if (!route || categories.length === 0) {
      requestSequenceRef.current += 1;
      setEstimates([]);
      setStatus("idle");
      setError(null);
      return;
    }

    const request: PricingRequest = {
      routeId: route.requestKey,
      origin: { latitude: route.origin.lat, longitude: route.origin.lng },
      destination: { latitude: route.destination.lat, longitude: route.destination.lng },
      stops: orderedStops.map((stop) => ({
        latitude: stop.latitude,
        longitude: stop.longitude,
      })),
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      categoryIds: categories.map((category) => category.id),
      serviceDetails,
    };

    const requestSignature = JSON.stringify(request);
    if (requestSignature === lastRequestRef.current) return;
    lastRequestRef.current = requestSignature;

    const requestId = ++requestSequenceRef.current;
    setEstimates([]);
    setStatus("loading");
    setError(null);

    try {
      const response = await pricingService.estimateFares(request);
      if (requestId !== requestSequenceRef.current) return;
      setEstimates(response.estimates);
      setStatus("success");
    } catch (caughtError: unknown) {
      if (requestId !== requestSequenceRef.current) return;
      console.error("[PricingProvider] price calculation failed", caughtError);
      lastRequestRef.current = "";
      setEstimates([]);
      setError("Não foi possível calcular os valores agora.");
      setStatus("error");
    }
  }, [categories, orderedStops, route, serviceDetails]);

  useEffect(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void calculatePricing();
    }, 350);

    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [calculatePricing]);

  const selectedEstimate = useMemo(
    () => estimates.find((estimate) => estimate.categoryId === selectedCategory?.id) ?? null,
    [estimates, selectedCategory?.id],
  );

  return (
    <PricingContext.Provider
      value={{
        estimates,
        selectedEstimate,
        estimate: selectedEstimate,
        status,
        error,
        serviceDetails,
        setServiceDetails,
        calculatePricing,
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
