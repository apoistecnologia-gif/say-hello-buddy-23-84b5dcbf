import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Geolocation, PermissionStatus } from "@capacitor/geolocation";

export type LocationPermissionState =
  "unknown" | "prompt" | "granted" | "denied" | "blocked" | "unavailable";

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp?: number;
}

interface LocationContextType {
  location: LocationData | null;
  currentPosition: LocationData | null;
  isLoading: boolean;
  error: string | null;
  permissionState: LocationPermissionState;
  requestPermission: () => Promise<void>;
  refreshLocation: () => Promise<void>;
  refreshPosition: () => Promise<void>; // Alias for backward compatibility
  openSettings: () => Promise<void>;
  clearLocationError: () => void;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<LocationPermissionState>("unknown");

  const clearLocationError = useCallback(() => setError(null), []);

  const openSettings = useCallback(async () => {
    // In Capacitor, we use NativeSettings or similar if needed,
    // but Geolocation doesn't provide a direct openSettings.
    // We'll leave it as a placeholder for platform-specific implementation.
    console.log("Open settings requested");
  }, []);

  const validateCoords = (lat: number, lng: number) => {
    return (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    );
  };

  const updateLocationState = (pos: any) => {
    if (pos && pos.coords) {
      const { latitude, longitude, accuracy } = pos.coords;
      if (validateCoords(latitude, longitude)) {
        const newData = {
          latitude,
          longitude,
          accuracy,
          timestamp: pos.timestamp,
        };
        setLocation(newData);
        setError(null);
        return true;
      }
    }
    return false;
  };

  const refreshLocation = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Attempt high accuracy first
      try {
        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 10000,
        });
        updateLocationState(position);
      } catch (highAccError) {
        console.warn("High accuracy failed, trying fallback:", highAccError);
        // Fallback to lower accuracy
        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: false,
          timeout: 10000,
        });
        updateLocationState(position);
      }
    } catch (err: any) {
      console.error("Failed to get position:", err);
      // DISTINGUISH ERRORS
      if (err.message?.includes("denied") || err.code === 1) {
        setPermissionState("denied");
        setError("Permissão de localização negada.");
      } else {
        setError("Não conseguimos obter sua localização agora. Verifique se o GPS está ativado.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const checkPermissions = useCallback(async () => {
    try {
      const status = await Geolocation.checkPermissions();
      setPermissionState(status.location as LocationPermissionState);
      return status;
    } catch (e) {
      console.error("Error checking permissions:", e);
      return null;
    }
  }, []);

  const requestPermission = useCallback(async () => {
    try {
      const status = await Geolocation.requestPermissions();
      setPermissionState(status.location as LocationPermissionState);
      if (status.location === "granted") {
        refreshLocation();
      }
    } catch (e) {
      console.error("Error requesting permissions:", e);
    }
  }, [refreshLocation]);

  useEffect(() => {
    let mounted = true;
    let watchId: string;

    const init = async () => {
      const status = await checkPermissions();
      if (!mounted) return;

      if (status?.location === "granted") {
        refreshLocation();

        watchId = await Geolocation.watchPosition(
          {
            enableHighAccuracy: true,
            timeout: 15000,
          },
          (position, err) => {
            if (!mounted) return;
            if (position) {
              updateLocationState(position);
            }
          },
        );
      }
    };

    init();

    return () => {
      mounted = false;
      if (watchId) {
        Geolocation.clearWatch({ id: watchId });
      }
    };
  }, [checkPermissions, refreshLocation]);

  return (
    <LocationContext.Provider
      value={{
        location,
        currentPosition: location,
        isLoading,
        error,
        permissionState,
        requestPermission,
        refreshLocation,
        refreshPosition: refreshLocation,
        openSettings,
        clearLocationError,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};

export const useLocation = () => {
  const context = useContext(LocationContext);
  if (!context) throw new Error("useLocation must be used within LocationProvider");
  return context;
};
