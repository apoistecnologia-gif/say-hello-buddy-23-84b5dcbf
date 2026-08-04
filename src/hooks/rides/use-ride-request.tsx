import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { RideRequestPayload, RideRequestResponse, RideRequestStatus } from "@/types/rides/ride-request";
import { rideRequestService } from "@/services/rides/ride-request-service";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "@/hooks/use-location";
import { usePickupAddress } from "@/hooks/use-pickup-address";
import { useDestination } from "@/hooks/use-destination";
import { useRoute } from "@/hooks/use-route";
import { useRideCategories } from "@/hooks/use-ride-categories";
import { usePricing } from "@/hooks/use-pricing";
import { usePaymentMethods } from "@/hooks/use-payment-methods";
import { useNavigate } from "@tanstack/react-router";

interface RideRequestContextType {
  status: RideRequestStatus;
  requestKey: string | null;
  rideId: string | null;
  officialEstimatedPrice: number | null;
  error: string | null;
  isSubmitting: boolean;
  submit: () => Promise<void>;
  reset: () => void;
  initiateReview: () => string;
}

const RideRequestContext = createContext<RideRequestContextType | undefined>(undefined);

export const RideRequestProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { location } = useLocation();
  const { address, pickupLabel, pickupShortLabel, pickupPlaceId } = usePickupAddress();
  const { destination } = useDestination();
  const { route } = useRoute();
  const { selectedCategory } = useRideCategories();
  const { estimate } = usePricing();
  const { selectedMethod } = usePaymentMethods();
  const navigate = useNavigate();

  const [status, setStatus] = useState<RideRequestStatus>("idle");
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [rideId, setRideId] = useState<string | null>(null);
  const [officialPrice, setOfficialPrice] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const isSubmittingRef = useRef(false);

  const initiateReview = useCallback(() => {
    const newKey = uuidv4();
    setRequestKey(newKey);
    setStatus("reviewing");
    return newKey;
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setRequestKey(null);
    setRideId(null);
    setOfficialPrice(null);
    setError(null);
    isSubmittingRef.current = false;
  }, []);

  const submit = useCallback(async () => {
    if (isSubmittingRef.current || !requestKey || !user || !location || !destination || !selectedCategory) return;
    
    isSubmittingRef.current = true;
    setStatus("submitting");
    setError(null);

    const payload: RideRequestPayload = {
      action: "create",
      request_key: requestKey,
      origin: {
        lat: location.latitude,
        lng: location.longitude
      },
      origin_name: address || "Localização atual",
      destination: {
        lat: destination.latitude,
        lng: destination.longitude
      },
      destination_name: destination.formattedAddress || destination.label,
      category: selectedCategory.key as any,
      distance_km: route ? route.distanceMeters / 1000 : null,
      duration_min: route ? route.durationSeconds / 60 : null,
      estimated_price: estimate?.baseFare ? estimate.baseFare + (estimate.extrasTotal || 0) : null,
      pickup_label: pickupLabel,
      pickup_short_label: pickupShortLabel,
      pickup_address: address,
      pickup_place_id: pickupPlaceId,
      pickup_source: "gps", // Simplified for now
      payment_method: selectedMethod,
      service_details: selectedCategory.details || null,
      scheduled_for: null
    };

    const response = await rideRequestService.createRide(payload);

    if (response.ok && response.rideId) {
      setRideId(response.rideId);
      setOfficialPrice(response.estimated_price || null);
      setStatus(response.reused ? "reused" : "success");
      
      // Navigate to ride page
      navigate({ to: "/corrida/$rideId", params: { rideId: response.rideId } });
    } else {
      setError(response.message || "Erro ao solicitar corrida");
      setStatus("failed");
      isSubmittingRef.current = false;
    }
  }, [user, location, destination, selectedCategory, address, pickupLabel, pickupShortLabel, pickupPlaceId, route, estimate, selectedMethod, requestKey, navigate]);

  return (
    <RideRequestContext.Provider value={{
      status,
      requestKey,
      rideId,
      officialEstimatedPrice: officialPrice,
      error,
      isSubmitting: status === "submitting",
      submit,
      reset,
      initiateReview
    }}>
      {children}
    </RideRequestContext.Provider>
  );
};

export const useRideRequest = () => {
  const context = useContext(RideRequestContext);
  if (!context) throw new Error("useRideRequest must be used within RideRequestProvider");
  return context;
};
