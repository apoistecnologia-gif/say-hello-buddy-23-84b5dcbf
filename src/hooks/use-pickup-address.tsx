import React, { createContext, useContext, useState, useEffect } from "react";
import { useLocation } from "@/hooks/use-location";

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

  useEffect(() => {
    if (location) {
       // Dummy geocoding for now, will be implemented in STO-004
       setAddress("Rua Exemplo, 123");
       setPickupLabel("Minha Localização");
       setPickupShortLabel("Rua Exemplo");
    }
  }, [location]);

  return (
    <PickupAddressContext.Provider value={{ 
      address, 
      pickupLabel, 
      pickupShortLabel, 
      pickupPlaceId, 
      isLoading, 
      status, 
      error: null,
      refreshAddress: async () => {} 
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
