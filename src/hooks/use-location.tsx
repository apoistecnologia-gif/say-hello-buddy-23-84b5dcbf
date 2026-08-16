import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import type { Position as CapacitorPosition } from "@capacitor/geolocation";

export type LocationPermissionState =
  | "unknown"
  | "prompt"
  | "granted"
  | "denied"
  | "blocked"
  | "unavailable";

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

type BrowserPosition = globalThis.GeolocationPosition;
type SupportedPosition = CapacitorPosition | BrowserPosition;

interface LocationContextType {
  location: LocationData | null;
  currentPosition: LocationData | null;
  isLoading: boolean;
  error: string | null;
  permissionState: LocationPermissionState;
  requestPermission: () => Promise<void>;
  refreshLocation: () => Promise<void>;
  refreshPosition: () => Promise<void>;
  openSettings: () => Promise<void>;
  clearLocationError: () => void;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);
const LAST_LOCATION_KEY = "apois-last-location";

const isValidCoordinate = (latitude: number, longitude: number) =>
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  latitude >= -90 &&
  latitude <= 90 &&
  longitude >= -180 &&
  longitude <= 180;

const normalizePosition = (position: SupportedPosition): LocationData => ({
  latitude: position.coords.latitude,
  longitude: position.coords.longitude,
  accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : 0,
  timestamp: typeof position.timestamp === "number" ? position.timestamp : Date.now(),
});

const normalizePermission = (value: string | undefined): LocationPermissionState => {
  if (value === "granted" || value === "prompt" || value === "denied") return value;
  if (value === "prompt-with-rationale") return "prompt";
  return "unknown";
};

const classifyLocationError = (error: unknown) => {
  const record = error as { code?: number | string; message?: string };
  const message = String(record.message ?? "").toLowerCase();
  const code = String(record.code ?? "");

  if (code === "1" || message.includes("denied") || message.includes("permission")) {
    return {
      permission: "denied" as LocationPermissionState,
      message: "Permissão de localização negada. Ative a localização nas configurações do aparelho.",
    };
  }
  if (code === "2" || message.includes("unavailable") || message.includes("location services")) {
    return {
      permission: "unavailable" as LocationPermissionState,
      message: "O GPS parece estar desligado ou indisponível. Ative a localização e tente novamente.",
    };
  }
  if (code === "3" || message.includes("timeout")) {
    return {
      permission: null,
      message: "A localização demorou para responder. Vá para um local aberto e tente novamente.",
    };
  }
  return {
    permission: null,
    message: "Não foi possível obter sua localização agora. Verifique o GPS e a conexão.",
  };
};

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Não reaproveita uma coordenada antiga como se fosse a posição atual.
  // A Home só recebe localização depois de uma leitura real do aparelho nesta sessão.
  const [location, setLocation] = useState<LocationData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionState, setPermissionState] =
    useState<LocationPermissionState>("unknown");
  const mountedRef = useRef(true);
  const watchIdRef = useRef<string | null>(null);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  const clearLocationError = useCallback(() => setError(null), []);

  const updateLocationState = useCallback((position: SupportedPosition) => {
    const nextLocation = normalizePosition(position);
    if (!isValidCoordinate(nextLocation.latitude, nextLocation.longitude)) return false;
    if (!mountedRef.current) return false;

    setLocation(nextLocation);
    setError(null);
    try {
      window.localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(nextLocation));
    } catch {
      // Location remains usable even when storage is unavailable.
    }
    return true;
  }, []);

  const checkPermissions = useCallback(async () => {
    try {
      const status = await Geolocation.checkPermissions();
      const normalized = normalizePermission(status.location);
      if (mountedRef.current) setPermissionState(normalized);
      return normalized;
    } catch (permissionError) {
      console.warn("[LocationProvider] Unable to check permission", permissionError);
      if (mountedRef.current) setPermissionState("unavailable");
      return "unavailable" as LocationPermissionState;
    }
  }, []);

  const refreshLocation = useCallback(async () => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const operation = (async () => {
      if (mountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const permission = await checkPermissions();
        if (permission !== "granted") {
          if (permission === "prompt" || permission === "unknown") {
            if (mountedRef.current) {
              setError("Permita o acesso à localização para mostrarmos seu ponto de partida.");
            }
          } else if (permission === "denied") {
            if (mountedRef.current) {
              setError("Permissão de localização negada. Ative-a nas configurações do aparelho.");
            }
          }
          return;
        }

        let position: CapacitorPosition;
        try {
          position = await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 15_000,
            maximumAge: 5_000,
          });
        } catch (highAccuracyError) {
          console.warn("[LocationProvider] High accuracy unavailable; using fallback", {
            message:
              highAccuracyError instanceof Error
                ? highAccuracyError.message
                : "high_accuracy_failed",
          });
          position = await Geolocation.getCurrentPosition({
            enableHighAccuracy: false,
            timeout: 10_000,
            maximumAge: 30_000,
          });
        }

        if (!updateLocationState(position) && mountedRef.current) {
          setError("O aparelho retornou coordenadas inválidas. Tente novamente.");
        }
      } catch (locationError) {
        const classified = classifyLocationError(locationError);
        console.error("[LocationProvider] Position request failed", {
          code: (locationError as { code?: unknown }).code ?? "unknown",
          message:
            locationError instanceof Error ? locationError.message : "location_unknown_error",
        });
        if (mountedRef.current) {
          if (classified.permission) setPermissionState(classified.permission);
          setError(classified.message);
        }
      } finally {
        if (mountedRef.current) setIsLoading(false);
        refreshInFlightRef.current = null;
      }
    })();

    refreshInFlightRef.current = operation;
    return operation;
  }, [checkPermissions, updateLocationState]);

  const requestPermission = useCallback(async () => {
    if (mountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const status = await Geolocation.requestPermissions({ permissions: ["location"] });
      const normalized = normalizePermission(status.location);
      if (mountedRef.current) setPermissionState(normalized);

      if (normalized === "granted") {
        await refreshLocation();
      } else if (mountedRef.current) {
        setError("Permissão de localização negada. Ative-a nas configurações do aparelho.");
      }
    } catch (permissionError) {
      console.error("[LocationProvider] Permission request failed", permissionError);
      if (mountedRef.current) {
        setPermissionState("denied");
        setError("Não foi possível solicitar a localização. Verifique as permissões do aplicativo.");
      }
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [refreshLocation]);

  const openSettings = useCallback(async () => {
    setError(
      "Abra Configurações do aparelho > Aplicativos > APOIS > Permissões e ative Localização.",
    );
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    const start = async () => {
      let permission = await checkPermissions();
      if (!mountedRef.current) return;

      // Android/iOS precisam disparar o diálogo nativo no primeiro acesso.
      // Antes, a inicialização apenas verificava a permissão e parava em "prompt".
      if (
        Capacitor.isNativePlatform() &&
        (permission === "prompt" || permission === "unknown")
      ) {
        await requestPermission();
        if (!mountedRef.current) return;
        permission = await checkPermissions();
      }

      if (!mountedRef.current || permission !== "granted") return;

      await refreshLocation();
      if (!mountedRef.current) return;

      try {
        watchIdRef.current = await Geolocation.watchPosition(
          {
            enableHighAccuracy: true,
            timeout: 20_000,
            maximumAge: 5_000,
          },
          (position, watchError) => {
            if (!mountedRef.current) return;
            if (position) {
              updateLocationState(position);
              return;
            }
            if (watchError) {
              const classified = classifyLocationError(watchError);
              if (classified.permission) setPermissionState(classified.permission);
              setError(classified.message);
            }
          },
        );
      } catch (watchError) {
        console.warn("[LocationProvider] Continuous location unavailable", watchError);
      }
    };

    void start();

    return () => {
      mountedRef.current = false;
      const watchId = watchIdRef.current;
      watchIdRef.current = null;
      if (watchId) void Geolocation.clearWatch({ id: watchId });
    };
  }, [checkPermissions, refreshLocation, requestPermission, updateLocationState]);

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
