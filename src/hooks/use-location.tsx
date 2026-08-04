import React, { createContext, useContext, useState, useEffect } from "react";
import { Geolocation } from "@capacitor/geolocation";

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
}

interface LocationContextType {
  location: LocationData | null;
  isLoading: boolean;
  error: string | null;
  accuracyQuality: "high" | "medium" | "low" | "none";
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const watchId = Geolocation.watchPosition({ enableHighAccuracy: true }, (position, err) => {
      if (err) {
        setError(err.message);
        setIsLoading(false);
        return;
      }
      if (position) {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
        setIsLoading(false);
      }
    });

    return () => {
      Geolocation.clearWatch({ id: watchId });
    };
  }, []);

  const accuracyQuality = !location ? "none" : location.accuracy < 20 ? "high" : location.accuracy < 100 ? "medium" : "low";

  return (
    <LocationContext.Provider value={{ location, isLoading, error, accuracyQuality }}>
      {children}
    </LocationContext.Provider>
  );
};

export const useLocation = () => {
  const context = useContext(LocationContext);
  if (!context) throw new Error("useLocation must be used within LocationProvider");
  return context;
};
