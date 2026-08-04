import React, { createContext, useContext, useState, ReactNode } from 'react';
import { DestinationAddress } from '../types/places';

interface DestinationContextType {
  destination: DestinationAddress | null;
  setDestination: (destination: DestinationAddress | null) => void;
  clearDestination: () => void;
  hasDestination: boolean;
  selectedAt: string | null;
  source: 'google_places' | null;
}

const DestinationContext = createContext<DestinationContextType | undefined>(undefined);

export function DestinationProvider({ children }: { children: ReactNode }) {
  const [destination, setDestinationState] = useState<DestinationAddress | null>(null);

  const setDestination = (dest: DestinationAddress | null) => {
    setDestinationState(dest);
  };

  const clearDestination = () => {
    setDestinationState(null);
  };

  return (
    <DestinationContext.Provider
      value={{
        destination,
        setDestination,
        clearDestination,
        hasDestination: !!destination,
        selectedAt: destination?.selectedAt || null,
        source: destination?.source || null,
      }}
    >
      {children}
    </DestinationContext.Provider>
  );
}

export function useDestination() {
  const context = useContext(DestinationContext);
  if (context === undefined) {
    throw new Error('useDestination must be used within a DestinationProvider');
  }
  return context;
}
