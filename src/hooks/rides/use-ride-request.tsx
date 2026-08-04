import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRideCategories } from "@/hooks/use-ride-categories";
import { useRoute } from "@/hooks/use-route";
import { RideRequestPayload, RideRequestResponse } from "@/types/rides/ride-request";
import { v4 as uuidv4 } from "uuid";
import React, { createContext, useContext, useState, useCallback, useRef } from "react";

interface RideRequest {
  requestKey: string | null;
  isSubmitting: boolean;
  error: string | null;
  lastResponse: RideRequestResponse | null;
}

interface RideRequestContextType {
  request: RideRequest;
  initiateReview: () => void;
  confirmRide: () => Promise<RideRequestResponse | null>;
  cancelRide: (rideId: string) => Promise<void>;
  resetRequest: () => void;
}

const RideRequestContext = createContext<RideRequestContextType | undefined>(undefined);

export const RideRequestProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { selectedCategory } = useRideCategories();
  const { route } = useRoute();
  
  const [request, setRequest] = useState<RideRequest>({
    requestKey: null,
    isSubmitting: false,
    error: null,
    lastResponse: null
  });

  const requestDataRef = useRef<{ category: string | null; origin: any; destination: any }>({
    category: null,
    origin: null,
    destination: null
  });

  const initiateReview = useCallback(() => {
    const currentCategory = selectedCategory?.key || null;
    const currentOrigin = route?.origin || null;
    const currentDestination = route?.destination || null;

    const hasChanged = 
      currentCategory !== requestDataRef.current.category ||
      JSON.stringify(currentOrigin) !== JSON.stringify(requestDataRef.current.origin) ||
      JSON.stringify(currentDestination) !== JSON.stringify(requestDataRef.current.destination);

    if (hasChanged || !request.requestKey) {
      const newKey = uuidv4();
      setRequest(prev => ({ ...prev, requestKey: newKey, error: null, lastResponse: null }));
      requestDataRef.current = { 
        category: currentCategory, 
        origin: currentOrigin, 
        destination: currentDestination 
      };
    }
  }, [selectedCategory, route, request.requestKey]);

  const confirmRide = useCallback(async (): Promise<RideRequestResponse | null> => {
    if (!user || !selectedCategory || !route || !request.requestKey) {
      setRequest(prev => ({ ...prev, error: "Dados incompletos para solicitação." }));
      return null;
    }

    setRequest(prev => ({ ...prev, isSubmitting: true, error: null }));

    const payload: RideRequestPayload = {
      action: "create",
      request_key: request.requestKey,
      category: selectedCategory.code,
      origin: route.origin,
      destination: route.destination,
      origin_name: "Origem",
      destination_name: "Destino",
      service_details: {} as Record<string, unknown>
    };

    try {
      const { data, error } = await supabase.functions.invoke("request-ride", {
        body: payload
      });

      if (error) throw error;

      setRequest(prev => ({ ...prev, isSubmitting: false, lastResponse: data }));
      return data as RideRequestResponse;
    } catch (err: any) {
      console.error("[RideRequest] Error:", err);
      setRequest(prev => ({ 
        ...prev, 
        isSubmitting: false, 
        error: err.message || "Erro ao processar sua solicitação." 
      }));
      return null;
    }
  }, [user, selectedCategory, route, request.requestKey]);

  const cancelRide = useCallback(async (rideId: string) => {
    const { error } = await supabase.functions.invoke("request-ride", {
      body: { action: "cancel", ride_id: rideId }
    });
    if (error) throw error;
  }, []);

  const resetRequest = useCallback(() => {
    setRequest({
      requestKey: null,
      isSubmitting: false,
      error: null,
      lastResponse: null
    });
    requestDataRef.current = { category: null, origin: null, destination: null };
  }, []);

  return (
    <RideRequestContext.Provider value={{
      request,
      initiateReview,
      confirmRide,
      cancelRide,
      resetRequest
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
