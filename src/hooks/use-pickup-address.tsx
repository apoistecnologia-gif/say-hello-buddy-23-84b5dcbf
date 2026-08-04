import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useLocation } from "@/hooks/use-location";
import { getReverseGeocoding } from "@/lib/geocoding";

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

export const PickupAddressProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { location } = useLocation();
  const [address, setAddress] = useState<string | null>(null);
  const [pickupLabel, setPickupLabel] = useState<string | null>(null);
  const [pickupShortLabel, setPickupShortLabel] = useState<string | null>(null);
  const [pickupPlaceId, setPickupPlaceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState<string | null>(null);

  const refreshAddress = useCallback(async () => {
    if (!location || !location.latitude || !location.longitude) return;

    setIsLoading(true);
    setStatus("identifying");
    setError(null);
    try {
      if (import.meta.env.DEV) {
        console.log(`[usePickupAddress] Requesting geocoding...`);
      }
      const formattedAddress = await getReverseGeocoding(location);

      if (import.meta.env.DEV) {
        console.log(`[usePickupAddress] Geocoding success`);
      }

      setAddress(formattedAddress);

      // Basic parsing for label/short label
      const parts = formattedAddress.split(",");
      if (parts.length > 0) {
        setPickupShortLabel(parts[0]?.trim() || "Localização atual");
        setPickupLabel(parts.slice(0, 2).join(", ").trim() || "Minha Localização");
      } else {
        setPickupLabel("Minha Localização");
        setPickupShortLabel("Localização atual");
      }
      setStatus("success");
    } catch (err: any) {
      console.error("Failed to refresh address:", err);
      setError(err.message || "Erro ao identificar endereço");
      setAddress(null); // Clear address on real error
      setStatus("error");
    } finally {
      setIsLoading(false);
    }
  }, [location]);

  useEffect(() => {
    if (location) {
      refreshAddress();
    }
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
