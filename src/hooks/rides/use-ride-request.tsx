import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCheckoutPreparation } from "@/hooks/use-checkout-preparation";
import { useDestination } from "@/hooks/use-destination";
import { usePaymentMethods } from "@/hooks/use-payment-methods";
import { usePickupAddress } from "@/hooks/use-pickup-address";
import { usePricing } from "@/hooks/use-pricing";
import { useRideCategories } from "@/hooks/use-ride-categories";
import { useRoute } from "@/hooks/use-route";
import { useRideStops } from "@/hooks/rides/use-ride-stops";
import { activeRideService } from "@/services/rides/active-ride-service";
import type {
  RideRequestPayload,
  RideRequestResponse,
  RideRequestStatus,
} from "@/types/rides/ride-request";

interface RideRequestState {
  requestKey: string | null;
  status: RideRequestStatus;
  isSubmitting: boolean;
  error: string | null;
  lastResponse: RideRequestResponse | null;
}

interface RideRequestContextType {
  request: RideRequestState;
  initiateReview: () => void;
  confirmRide: () => Promise<RideRequestResponse | null>;
  cancelRide: (rideId: string, reason?: string) => Promise<RideRequestResponse>;
  resetRequest: () => void;
}

const RideRequestContext = createContext<RideRequestContextType | undefined>(undefined);
const RECOVERY_DELAYS_MS = [0, 500, 1_200] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function readErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (isRecord(error) && typeof error["message"] === "string" && error["message"].trim()) {
    return error["message"];
  }
  return fallback;
}

function friendlyRideError(error: unknown): string {
  const raw = readErrorMessage(error, "Não foi possível solicitar a corrida agora.");
  const normalized = raw.toLowerCase();

  if (normalized.includes("passenger_debt_block")) {
    return "Existe uma pendência na sua carteira. Quite o débito antes de pedir outra corrida.";
  }
  if (normalized.includes("passenger_blocked")) {
    return "Sua conta está bloqueada. Abra a Ajuda para verificar o motivo.";
  }
  if (normalized.includes("passenger_suspended")) {
    return "Sua conta está temporariamente suspensa.";
  }
  if (normalized.includes("payment_method")) {
    return "A forma de pagamento selecionada não está disponível.";
  }
  if (normalized.includes("route_calculation_failed")) {
    return "Não foi possível validar a rota. Confira a conexão e tente novamente.";
  }
  if (normalized.includes("pricing") || normalized.includes("tariff")) {
    return "Não foi possível validar o valor da corrida agora.";
  }
  if (normalized.includes("active_ride") || normalized.includes("already_has_active")) {
    return "Você já possui uma corrida em andamento.";
  }
  if (normalized.includes("request_timeout") || normalized.includes("timeout")) {
    return "A resposta demorou mais que o esperado. Verificamos se a corrida foi criada antes de liberar uma nova tentativa.";
  }
  if (normalized.includes("network") || normalized.includes("fetch")) {
    return "A conexão foi interrompida. Verificamos se a corrida foi criada antes de liberar uma nova tentativa.";
  }
  return raw;
}

function isUnknownSubmissionOutcome(error: unknown): boolean {
  const normalized = readErrorMessage(error, "").toLowerCase();
  return ["timeout", "request_timeout", "network", "fetch", "connection", "aborted"].some(
    (marker) => normalized.includes(marker),
  );
}

async function recoverRideCreatedWithoutResponse(
  passengerId: string,
): Promise<RideRequestResponse | null> {
  for (const delay of RECOVERY_DELAYS_MS) {
    if (delay > 0) await sleep(delay);

    try {
      const recoveredRide = await activeRideService.getActiveRide(passengerId);
      if (!recoveredRide) continue;

      return {
        ok: true,
        rideId: recoveredRide.id,
        reused: true,
        status: recoveredRide.status,
        estimated_price: recoveredRide.estimated_price,
        message: "A corrida foi encontrada após a reconexão.",
      };
    } catch (caughtError: unknown) {
      console.warn("[RideRequest] Active ride recovery attempt failed", {
        message: readErrorMessage(caughtError, "unknown_recovery_error"),
        delay,
      });
    }
  }

  return null;
}

function friendlyCancellationError(error: unknown): string {
  const raw = readErrorMessage(error, "Não foi possível cancelar a corrida.");
  const normalized = raw.toLowerCase();

  if (
    normalized.includes("cancellation_not_allowed") ||
    normalized.includes("ride_cancellation_blocked_after_arrival")
  ) {
    return "O cancelamento não é permitido depois que o motorista chega ao embarque.";
  }
  if (
    normalized.includes("invalid_ride_status") ||
    normalized.includes("ride_cancellation_blocked_in_progress")
  ) {
    return "A corrida já começou e não pode ser cancelada pelo aplicativo.";
  }
  if (normalized.includes("ride_status_changed")) {
    return "O status da corrida mudou. Atualize a tela antes de tentar novamente.";
  }
  if (normalized.includes("ride_already_closed")) {
    return "Esta corrida já foi encerrada.";
  }
  if (normalized.includes("ride_not_found") || normalized.includes("unauthorized")) {
    return "A corrida não foi encontrada ou não pertence à sua conta.";
  }
  return raw;
}

function parseRideResponse(value: unknown): RideRequestResponse {
  if (!isRecord(value) || value["ok"] !== true) {
    const code = isRecord(value) && typeof value["error"] === "string" ? value["error"] : null;
    const errorCode =
      isRecord(value) && typeof value["error_code"] === "string" ? value["error_code"] : null;
    const message =
      isRecord(value) && typeof value["message"] === "string"
        ? value["message"]
        : errorCode || code || "Não foi possível solicitar a corrida agora.";
    throw new Error(message);
  }

  const response: RideRequestResponse = { ok: true };
  if (typeof value["rideId"] === "string") response.rideId = value["rideId"];
  if (typeof value["ride_id"] === "string") response.rideId = value["ride_id"];
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
  if (typeof value["fee_applied"] === "number" && Number.isFinite(value["fee_applied"])) {
    response.fee_applied = value["fee_applied"];
  }
  if (
    typeof value["cancellation_fee"] === "number" &&
    Number.isFinite(value["cancellation_fee"])
  ) {
    response.fee_applied = value["cancellation_fee"];
  }
  if (typeof value["free_seconds"] === "number" && Number.isFinite(value["free_seconds"])) {
    response.free_seconds = value["free_seconds"];
  }
  if (typeof value["reused"] === "boolean") response.reused = value["reused"];
  if (typeof value["message"] === "string") response.message = value["message"];
  if (typeof value["error_code"] === "string") response.error_code = value["error_code"];

  return response;
}

function toServiceDetails(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value) || Object.keys(value).length === 0) return null;
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function createSnapshotSignature(parts: unknown[]): string {
  return JSON.stringify(parts);
}

export const RideRequestProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile } = useAuth();
  const { selectedCategory } = useRideCategories();
  const { route } = useRoute();
  const { destination } = useDestination();
  const { orderedStops } = useRideStops();
  const { selectedMethod } = usePaymentMethods();
  const { serviceDetails } = usePricing();
  const { checkout } = useCheckoutPreparation();
  const {
    address: pickupAddress,
    pickupLabel,
    pickupShortLabel,
    pickupPlaceId,
  } = usePickupAddress();

  const [request, setRequest] = useState<RideRequestState>({
    requestKey: null,
    status: "idle",
    isSubmitting: false,
    error: null,
    lastResponse: null,
  });

  const snapshotSignatureRef = useRef("");
  const activeSubmissionRef = useRef<Promise<RideRequestResponse | null> | null>(null);

  const currentSignature = createSnapshotSignature([
    route?.requestKey ?? null,
    selectedCategory?.code ?? null,
    destination?.placeId ?? null,
    selectedMethod,
    orderedStops.map((stop) => [stop.placeId, stop.order]),
    serviceDetails,
    checkout.finalTotal,
  ]);

  const initiateReview = useCallback(() => {
    const changed = currentSignature !== snapshotSignatureRef.current;

    setRequest((previous) => ({
      ...previous,
      requestKey: changed || !previous.requestKey ? uuidv4() : previous.requestKey,
      status: "reviewing",
      error: null,
      lastResponse: changed ? null : previous.lastResponse,
    }));

    snapshotSignatureRef.current = currentSignature;
  }, [currentSignature]);

  const confirmRide = useCallback(async (): Promise<RideRequestResponse | null> => {
    if (activeSubmissionRef.current) return activeSubmissionRef.current;

    const execute = async (): Promise<RideRequestResponse | null> => {
      if (
        !user ||
        !selectedCategory ||
        !route ||
        !destination ||
        !selectedMethod ||
        !request.requestKey ||
        !checkout.readiness
      ) {
        setRequest((previous) => ({
          ...previous,
          status: "failed",
          error: "Revise a rota, a categoria e a forma de pagamento antes de continuar.",
        }));
        return null;
      }

      const originLabel =
        pickupShortLabel ||
        pickupLabel ||
        pickupAddress ||
        `Local ${route.origin.lat.toFixed(5)}, ${route.origin.lng.toFixed(5)}`;
      const originAddress = pickupAddress || pickupLabel || originLabel;
      const destinationLabel = destination.label || destination.formattedAddress;

      const payload: RideRequestPayload = {
        action: "create",
        request_key: request.requestKey,
        category: selectedCategory.code,
        origin: {
          lat: route.origin.lat,
          lng: route.origin.lng,
          label: originLabel,
          address: originAddress,
          place_id: pickupPlaceId,
          source: "gps",
        },
        origin_name: originLabel,
        destination: {
          lat: destination.latitude,
          lng: destination.longitude,
          label: destinationLabel,
          address: destination.formattedAddress,
          place_id: destination.placeId,
          source: destination.placeId.startsWith("map:") ? "map" : "places",
        },
        destination_name: destinationLabel,
        intermediates: orderedStops.map((stop, index) => ({
          lat: stop.latitude,
          lng: stop.longitude,
          label: stop.label,
          address: stop.formattedAddress,
          place_id: stop.placeId,
          source: stop.source === "google_places" ? "places" : "recent",
          order: index,
        })),
        distance_km: Math.round((route.distanceMeters / 1000) * 100) / 100,
        duration_min: Math.max(1, Math.ceil(route.durationSeconds / 60)),
        encoded_polyline: route.encodedPolyline || null,
        client_estimated_price: checkout.finalTotal,
        payment_method: selectedMethod,
        service_details: toServiceDetails(serviceDetails),
        scheduled_for: null,
      };

      setRequest((previous) => ({
        ...previous,
        status: "submitting",
        isSubmitting: true,
        error: null,
      }));

      try {
        const { data, error } = await supabase.functions.invoke("passenger-ride-request", {
          body: payload,
        });

        if (error) throw error;

        const parsed = parseRideResponse(data);
        setRequest((previous) => ({
          ...previous,
          status: parsed.reused ? "reused" : "success",
          isSubmitting: false,
          error: null,
          lastResponse: parsed,
        }));
        return parsed;
      } catch (error: unknown) {
        const message = friendlyRideError(error);
        console.error("[RideRequest] request failed", {
          message: readErrorMessage(error, "unknown_error"),
          requestKey: request.requestKey,
        });

        if (isUnknownSubmissionOutcome(error) && profile) {
          const recovered = await recoverRideCreatedWithoutResponse(profile.id);
          if (recovered) {
            setRequest((previous) => ({
              ...previous,
              status: "reused",
              isSubmitting: false,
              error: null,
              lastResponse: recovered,
            }));
            return recovered;
          }
        }

        setRequest((previous) => ({
          ...previous,
          status: isUnknownSubmissionOutcome(error) ? "timeout_unknown" : "failed",
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
  }, [
    checkout.finalTotal,
    checkout.readiness,
    destination,
    orderedStops,
    pickupAddress,
    pickupLabel,
    pickupPlaceId,
    pickupShortLabel,
    profile,
    request.requestKey,
    route,
    selectedCategory,
    selectedMethod,
    serviceDetails,
    user,
  ]);

  const cancelRide = useCallback(
    async (rideId: string, reason?: string): Promise<RideRequestResponse> => {
      if (!rideId.trim()) throw new Error("Corrida inválida para cancelamento.");

      const { data, error } = await supabase.functions.invoke("cancel-ride", {
        body: {
          ride_id: rideId,
          reason: reason?.trim() || null,
        },
      });

      if (error) throw new Error(friendlyCancellationError(error));

      try {
        return parseRideResponse(data);
      } catch (parseError: unknown) {
        throw new Error(friendlyCancellationError(parseError));
      }
    },
    [],
  );

  const resetRequest = useCallback(() => {
    activeSubmissionRef.current = null;
    snapshotSignatureRef.current = "";
    setRequest({
      requestKey: null,
      status: "idle",
      isSubmitting: false,
      error: null,
      lastResponse: null,
    });
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