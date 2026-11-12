import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useLocation } from "@/hooks/use-location";
import { geocodingService } from "@/services/geocoding/geocoding-service";

export interface ManualPickupSelection {
  latitude: number;
  longitude: number;
  label: string;
  formattedAddress: string;
  placeId?: string;
}

interface PickupAddressContextType {
  address: string | null;
  pickupLabel: string | null;
  pickupShortLabel: string | null;
  pickupPlaceId: string | null;
  pickupPosition: { lat: number; lng: number } | null;
  isManualPickup: boolean;
  setManualPickup: (selection: ManualPickupSelection) => void;
  restoreGpsPickup: () => void;
  isLoading: boolean;
  status: string;
  error: string | null;
  refreshAddress: () => Promise<void>;
}

const PickupAddressContext = createContext<PickupAddressContextType | undefined>(undefined);
const AUTO_GEOCODE_DISTANCE_METERS = 150;
const AUTO_GEOCODE_INTERVAL_MS = 5 * 60 * 1000;

function looksLikePlusCode(value: string): boolean {
  return /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\b/i.test(value.trim());
}

function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const latMeters = (a.latitude - b.latitude) * 111_195;
  const lngMeters = (a.longitude - b.longitude) * 111_195 * Math.cos((a.latitude * Math.PI) / 180);
  return Math.hypot(latMeters, lngMeters);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Não foi possível identificar o endereço. Tente novamente ou selecione a partida.";
}

export const PickupAddressProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { location } = useLocation();
  const [address, setAddress] = useState<string | null>(null);
  const [pickupLabel, setPickupLabel] = useState<string | null>(null);
  const [pickupShortLabel, setPickupShortLabel] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState<string | null>(null);
  const [manualPickup, setManualPickupState] = useState<ManualPickupSelection | null>(null);
  const requestSequenceRef = useRef(0);
  const lastAutoAttemptRef = useRef<{ latitude: number; longitude: number; at: number } | null>(null);

  const refreshAddress = useCallback(async () => {
    // A manual pickup is authoritative until the passenger explicitly switches to GPS.
    if (manualPickup || !location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return;

    const requestId = ++requestSequenceRef.current;
    setIsLoading(true);
    setStatus("identifying");
    setError(null);
    try {
      const resolved = await geocodingService.resolvePickupAddress({
        lat: location.latitude,
        lng: location.longitude,
      });
      if (requestId !== requestSequenceRef.current) return;

      const humanLabel = resolved.label?.trim() || resolved.shortLabel?.trim() || "Localização atual";
      const humanShort = resolved.shortLabel?.trim() || humanLabel;
      const humanSub = resolved.subLabel?.trim() || "";
      const rawAddress = resolved.address?.trim() || "";
      const readableAddress = humanSub && humanSub !== humanLabel
        ? `${humanLabel} • ${humanSub}`
        : humanLabel;
      const displayAddress =
        rawAddress && !looksLikePlusCode(rawAddress) && humanLabel === "Endereço não identificado"
          ? rawAddress
          : readableAddress;

      setAddress(displayAddress);
      setPickupLabel(humanLabel);
      setPickupShortLabel(humanShort);
      setStatus("success");
    } catch (caughtError: unknown) {
      if (requestId !== requestSequenceRef.current) return;
      console.warn("[PickupAddress] Reverse geocoding failed", {
        code: caughtError && typeof caughtError === "object" && "code" in caughtError
          ? (caughtError as { code?: unknown }).code
          : "unknown",
      });
      setError(errorMessage(caughtError));
      setAddress(null);
      setPickupLabel(null);
      setPickupShortLabel(null);
      setStatus("error");
    } finally {
      if (requestId === requestSequenceRef.current) setIsLoading(false);
    }
  }, [location, manualPickup]);

  const setManualPickup = useCallback((selection: ManualPickupSelection) => {
    if (!Number.isFinite(selection.latitude) || !Number.isFinite(selection.longitude) ||
        Math.abs(selection.latitude) > 90 || Math.abs(selection.longitude) > 180) {
      return;
    }
    requestSequenceRef.current += 1;
    setManualPickupState(selection);
  }, []);

  const restoreGpsPickup = useCallback(() => {
    requestSequenceRef.current += 1;
    lastAutoAttemptRef.current = null;
    setManualPickupState(null);
    setAddress(null);
    setPickupLabel(null);
    setPickupShortLabel(null);
    setError(null);
    setStatus("idle");
  }, []);

  useEffect(() => {
    if (manualPickup || !location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return;
    const previous = lastAutoAttemptRef.current;
    if (previous &&
      distanceMeters(previous, location) < AUTO_GEOCODE_DISTANCE_METERS &&
      Date.now() - previous.at < AUTO_GEOCODE_INTERVAL_MS) return;

    // Do not hammer the paid Geocoding API on every watchPosition GPS jitter,
    // especially when the backend reports an unavailable API or denied key.
    lastAutoAttemptRef.current = { latitude: location.latitude, longitude: location.longitude, at: Date.now() };
    void refreshAddress();
  }, [location, manualPickup, refreshAddress]);

  useEffect(() => () => { requestSequenceRef.current += 1; }, []);

  const effectivePosition = manualPickup
    ? { lat: manualPickup.latitude, lng: manualPickup.longitude }
    : location ? { lat: location.latitude, lng: location.longitude } : null;

  return (
    <PickupAddressContext.Provider value={{
      address: manualPickup?.formattedAddress || address,
      pickupLabel: manualPickup?.label || pickupLabel,
      pickupShortLabel: manualPickup?.label || pickupShortLabel,
      pickupPlaceId: manualPickup?.placeId || null,
      pickupPosition: effectivePosition,
      isManualPickup: manualPickup !== null,
      setManualPickup,
      restoreGpsPickup,
      isLoading: manualPickup ? false : isLoading,
      status: manualPickup ? "success" : status,
      error: manualPickup ? null : error,
      refreshAddress,
    }}>
      {children}
    </PickupAddressContext.Provider>
  );
};

export const usePickupAddress = () => {
  const context = useContext(PickupAddressContext);
  if (!context) throw new Error("usePickupAddress must be used within PickupAddressProvider");
  return context;
};
