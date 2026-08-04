import React, { createContext, useContext, useState } from "react";

export interface Destination {
  label: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  placeId: string;
}

interface DestinationContextType {
  destination: Destination | null;
  setDestination: (dest: Destination | null) => void;
  hasDestination: boolean;
  clearDestination: () => void;
}

const DestinationContext = createContext<DestinationContextType | undefined>(undefined);

export const DestinationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [destination, setDestination] = useState<Destination | null>(null);

  const clearDestination = () => setDestination(null);

  return (
    <DestinationContext.Provider
      value={{
        destination,
        setDestination,
        hasDestination: !!destination,
        clearDestination,
      }}
    >
      {children}
    </DestinationContext.Provider>
  );
};

export const useDestination = () => {
  const context = useContext(DestinationContext);
  if (!context) throw new Error("useDestination must be used within DestinationProvider");
  return context;
};
