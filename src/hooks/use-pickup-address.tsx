import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useLocation } from "@/hooks/use-location";
import { geocodingService } from "@/services/geocoding/geocoding-service";

interface PickupAddressContextType {
  address: string | null;
  pickupLabel: string | null;
  pickupShortLabel: string | null;
  pickupPlaceId: string | null;
  isLoading: boolean;
  status: string;
  error: string | null;
  refreshAddress: () => Promise<void>;
}

const PickupAddressContext = createContext<PickupAddressContextType | undefined>(undefined);

function looksLikePlusCode(value: string): boolean {
  return /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\b/i.test(value.trim());
}

export const PickupAddressProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { location } = useLocation();
  const [address, setAddress] = useState<string | null>(null);
  const [pickupLabel, setPickupLabel] = useState<string | null>(null);
  const [pickupShortLabel, setPickupShortLabel] = useState<string | null>(null);
  const [pickupPlaceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState<string | null>(null);

  const refreshAddress = useCallback(async () => {
    if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return;

    setIsLoading(true);
    setStatus("identifying");
    setError(null);

    try {
      const resolved = await geocodingService.resolvePickupAddress({
        lat: location.latitude,
        lng: location.longitude,
      });

      const humanLabel = resolved.label?.trim() || resolved.shortLabel?.trim() || "Localização atual";
      const humanShort = resolved.shortLabel?.trim() || humanLabel;
      const humanSub = resolved.subLabel?.trim() || "";

      const rawAddress = resolved.address?.trim() || "";
      const readableAddress =
        humanSub && humanSub !== humanLabel
          ? `${humanLabel} • ${humanSub}`
          : humanLabel;

      // Plus Codes are valid Google identifiers, but are poor primary labels in
      // a passenger UI. Prefer street/neighborhood/city labels whenever the
      // reverse geocoder supplied them.
      const displayAddress =
        rawAddress && !looksLikePlusCode(rawAddress) && humanLabel === "Endereço não identificado"
          ? rawAddress
          : readableAddress;

      setAddress(displayAddress);
      setPickupLabel(humanLabel);
      setPickupShortLabel(humanShort);
      setStatus("success");
    } catch (caughtError: unknown) {
      const message =
        caughtError instanceof Error && caughtError.message
          ? caughtError.message
          : "Erro ao identificar endereço";
      console.error("Failed to refresh address:", caughtError);
      setError(message);
      setAddress(null);
      setPickupLabel(null);
      setPickupShortLabel(null);
      setStatus("error");
    } finally {
      setIsLoading(false);
    }
  }, [location]);

  useEffect(() => {
    if (location) void refreshAddress();
  }, [location, refreshAddress]);

  return (
    <PickupAddressContext.Provider
      value={{
        address,
        pickupLabel,
        pickupShortLabel,
        pickupPlaceId,
        isLoading,
        status,
        error,
        refreshAddress,
      }}
    >
      {children}
    </PickupAddressContext.Provider>
  );
};

export const usePickupAddress = () => {
  const context = useContext(PickupAddressContext);
  if (!context) throw new Error("usePickupAddress must be used within PickupAddressProvider");
  return context;
};