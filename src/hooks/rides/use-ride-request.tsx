import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRideCategories } from "@/hooks/use-ride-categories";
import { useRoute } from "@/hooks/use-route";
import type { RouteCoordinates } from "@/types/routes";
import type { RideRequestPayload, RideRequestResponse } from "@/types/rides/ride-request";
import { v4 as uuidv4 } from "uuid";
import React, { createContext, useContext, useState, useCallback, useRef } from "react";

interface RideRequest {
  requestKey: string | null;
  isSubmitting: boolean;
  error: string | null;
  lastResponse: RideRequestResponse | null;
}

interface RideRequestSnapshot {
  category: string | null;
  origin: RouteCoordinates | null;
  destination: RouteCoordinates | null;
}

interface RideRequestContextType {
  request: RideRequest;
  initiateReview: () => void;
  confirmRide: () => Promise<RideRequestResponse | null>;
  cancelRide: (rideId: string) => Promise<void>;
  resetRequest: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (isRecord(error) && typeof error["message"] === "string" && error["message"].trim()) {
    return error["message"];
  }
  return fallback;
}

function parseRideResponse(value: unknown): RideRequestResponse {
  if (!isRecord(value) || value["ok"] !== true) {
    const message =
      isRecord(value) && typeof value["message"] === "string"
        ? value["message"]
        : "Não foi possível solicitar a corrida agora.";
    throw new Error(message);
  }

  const response: RideRequestResponse = { ok: true };
  if (typeof value["rideId"] === "string") response.rideId = value["rideId"];
  if (typeof value["candidates"] === "number" && Number.isFinite(value["candidates"])) {
    response.candidates = value["candidates"];
  }
  if (typeof value["scheduled_for"] === "string" || value["scheduled_for"] === null) {
    response.scheduled_for = value["scheduled_for"];
  }
  if (typeof value["status"] === "string") response.status = value["status"];
  if (typeof value["estimated_price"] === "number" && Number.isFinite(value["estimated_price"])) {
    response.estimated_price = value["estimated_price"];
  }
  if (typeof value["reused"] === "boolean") response.reused = value["reused"];
  if (typeof value["message"] === "string") response.message = value["message"];
  if (typeof value["error_code"] === "string") response.error_code = value["error_code"];

  return response;
}

function sameCoordinates(a: RouteCoordinates | null, b: RouteCoordinates | null): boolean {
  if (a === null || b === null) return a === b;
  return a.lat === b.lat && a.lng === b.lng;
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
    lastResponse: null,
  });

  const requestDataRef = useRef<RideRequestSnapshot>({
    category: null,
    origin: null,
    destination: null,
  });
  const activeSubmissionRef = useRef<Promise<RideRequestResponse | null> | null>(null);

  const initiateReview = useCallback(() => {
    const currentCategory = selectedCategory?.key ?? null;
    const currentOrigin = route?.origin ?? null;
    const currentDestination = route?.destination ?? null;

    const hasChanged =
      currentCategory !== requestDataRef.current.category ||
      !sameCoordinates(currentOrigin, requestDataRef.current.origin) ||
      !sameCoordinates(currentDestination, requestDataRef.current.destination);

    if (hasChanged || !request.requestKey) {
      setRequest((previous) => ({
        ...previous,
        requestKey: uuidv4(),
        error: null,
        lastResponse: null,
      }));
      requestDataRef.current = {
        category: currentCategory,
        origin: currentOrigin,
        destination: currentDestination,
      };
    }
  }, [selectedCategory, route, request.requestKey]);

  const confirmRide = useCallback(async (): Promise<RideRequestResponse | null> => {
    if (activeSubmissionRef.current) return activeSubmissionRef.current;

    const execute = async (): Promise<RideRequestResponse | null> => {
      if (!user || !selectedCategory || !route || !request.requestKey) {
        setRequest((previous) => ({
          ...previous,
          error: "Dados incompletos para solicitação.",
        }));
        return null;
      }

      setRequest((previous) => ({ ...previous, isSubmitting: true, error: null }));

      const payload: RideRequestPayload = {
        action: "create",
        request_key: request.requestKey,
        category: selectedCategory.code,
        origin: route.origin,
        destination: route.destination,
        origin_name: "Origem",
        destination_name: "Destino",
        distance_km: route.distanceMeters / 1000,
        duration_min: route.durationSeconds / 60,
        service_details: {},
      };

      try {
        const { data, error } = await supabase.functions.invoke("request-ride", {
          body: payload,
        });

        if (error) throw error;

        const parsed = parseRideResponse(data);
        setRequest((previous) => ({
          ...previous,
          isSubmitting: false,
          error: null,
          lastResponse: parsed,
        }));
        return parsed;
      } catch (error: unknown) {
        const message = readErrorMessage(error, "Erro ao processar sua solicitação.");
        console.error("[RideRequest] Error:", message);
        setRequest((previous) => ({
          ...previous,
          isSubmitting: false,
          error: message,
        }));
        return null;
      }
    };

    const submission = execute();
    activeSubmissionRef.current = submission;

    try {
      return await submission;
    } finally {
      activeSubmissionRef.current = null;
    }
  }, [user, selectedCategory, route, request.requestKey]);

  const cancelRide = useCallback(async (rideId: string): Promise<void> => {
    if (!rideId.trim()) throw new Error("Corrida inválida para cancelamento.");

    const { data, error } = await supabase.functions.invoke("request-ride", {
      body: { action: "cancel", ride_id: rideId },
    });

    if (error) throw new Error(error.message || "Não foi possível cancelar a corrida.");
    if (isRecord(data) && data["ok"] === false) {
      throw new Error(
        typeof data["message"] === "string"
          ? data["message"]
          : "Não foi possível cancelar a corrida.",
      );
    }
  }, []);

  const resetRequest = useCallback(() => {
    activeSubmissionRef.current = null;
    setRequest({
      requestKey: null,
      isSubmitting: false,
      error: null,
      lastResponse: null,
    });
    requestDataRef.current = { category: null, origin: null, destination: null };
  }, []);

  return (
    <RideRequestContext.Provider
      value={{
        request,
        initiateReview,
        confirmRide,
        cancelRide,
        resetRequest,
      }}
    >
      {children}
    </RideRequestContext.Provider>
  );
};

export const useRideRequest = (): RideRequestContextType => {
  const context = useContext(RideRequestContext);
  if (!context) throw new Error("useRideRequest must be used within RideRequestProvider");
  return context;
};
