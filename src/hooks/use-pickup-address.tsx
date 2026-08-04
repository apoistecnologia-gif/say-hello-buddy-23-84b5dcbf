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

  const refreshAddress = useCallback(async () => {
    if (!location) return;
    
    setIsLoading(true);
    setStatus("identifying");
    try {
      const formattedAddress = await getReverseGeocoding(location);
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
    } catch (err) {
      console.error("Failed to refresh address:", err);
      setAddress("Sua localização atual");
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
    <PickupAddressContext.Provider value={{ 
      address, 
      pickupLabel, 
      pickupShortLabel, 
      pickupPlaceId, 
      isLoading, 
      status, 
      error: null,
      refreshAddress
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
