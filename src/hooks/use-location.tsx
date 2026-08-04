import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Geolocation, PermissionStatus } from "@capacitor/geolocation";

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
}

interface LocationContextType {
  location: LocationData | null;
  currentPosition: LocationData | null;
  isLoading: boolean;
  error: string | null;
  accuracyQuality: "high" | "medium" | "low" | "none";
  permissionStatus: PermissionStatus | null;
  requestPermission: () => Promise<void>;
  refreshPosition: () => Promise<void>;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus | null>(null);

  const refreshPosition = useCallback(async () => {
    try {
      setIsLoading(true);
      const position = await Geolocation.getCurrentPosition();
      setLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy
      });
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to get position");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    const status = await Geolocation.requestPermissions();
    setPermissionStatus(status);
  }, []);

  useEffect(() => {
    let mounted = true;
    let watchId: string;
    
    const initLocation = async () => {
      try {
        const status = await Geolocation.checkPermissions();
        if (mounted) setPermissionStatus(status);

        // Don't auto-start watch on web if it blocks UI
        // In the future, we can add a check for isNativePlatform()
        watchId = await Geolocation.watchPosition({ enableHighAccuracy: true }, (position, err) => {
          if (!mounted) return;
          if (err) {
            console.warn("[useLocation] Watch error:", err);
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
      } catch (e) {
        console.error("[useLocation] Failed to initialize location:", e);
        if (mounted) setIsLoading(false);
      }
    };

    initLocation();

    return () => {
      mounted = false;
      if (watchId) {
        Geolocation.clearWatch({ id: watchId });
      }
    };
  }, []);

  const accuracyQuality = !location ? "none" : location.accuracy < 20 ? "high" : location.accuracy < 100 ? "medium" : "low";

  return (
    <LocationContext.Provider value={{ 
      location, 
      currentPosition: location,
      isLoading, 
      error, 
      accuracyQuality, 
      permissionStatus,
      requestPermission,
      refreshPosition
    }}>
      {children}
    </LocationContext.Provider>
  );
};

export const useLocation = () => {
  const context = useContext(LocationContext);
  if (!context) throw new Error("useLocation must be used within LocationProvider");
  return context;
};
