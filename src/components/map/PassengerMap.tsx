import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useLocation } from "@/hooks/use-location";
import { useRoute } from "@/hooks/use-route";
import { useRideStops } from "@/hooks/rides/use-ride-stops";
import { useDestination } from "@/hooks/use-destination";
import { googleMapsLoader } from "@/services/google/google-maps-loader";

interface PassengerMapProps {
  origin: { lat: number; lng: number } | undefined;
  destination: { lat: number; lng: number } | undefined;
  encodedPolyline: string | undefined;
  driverLocation: { lat: number; lng: number; heading?: number } | undefined;
  isStatic: boolean | undefined;
  selectionMode?: boolean;
  onCenterChange?: (coordinate: { lat: number; lng: number }) => void;
}

type MapStatus = "loading" | "ready" | "configuration-error" | "api-error";
type Coordinate = { lat: number; lng: number };

// Centro neutro do Brasil usado somente enquanto ainda não existe uma
// coordenada real do aparelho. Nunca deve ser tratado como origem do usuário.
const NEUTRAL_CENTER = { lat: -14.235, lng: -51.9253 };
const NEUTRAL_ZOOM = 4;
const DRIVER_ANIMATION_MS = 900;
const CAMERA_UPDATE_INTERVAL_MS = 1800;

const DARK_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#171a21" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#171a21" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8f96a3" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#c7cbd3" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#8d939f" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#17231e" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6f8b78" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#252a33" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#15181e" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#a5aab3" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#343943" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#20242b" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#20242c" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d2532" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#67808c" }] },
];

const isCoordinate = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const interpolateCoordinate = (from: Coordinate, to: Coordinate, progress: number): Coordinate => ({
  lat: from.lat + (to.lat - from.lat) * progress,
  lng: from.lng + (to.lng - from.lng) * progress,
});

const easeOutCubic = (progress: number): number => 1 - Math.pow(1 - progress, 3);

const PassengerMap: React.FC<PassengerMapProps> = ({
  origin: customOrigin,
  destination: customDestination,
  driverLocation,
  isStatic = false,
  selectionMode = false,
  onCenterChange,
}) => {
  const { location } = useLocation();
  const { route } = useRoute();
  const { orderedStops } = useRideStops();
  const { destination: globalDestination } = useDestination();

  const containerRef = useRef<HTMLDivElement>(null);
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const staticMarkersRef = useRef<any[]>([]);
  const driverMarkerRef = useRef<any>(null);
  const driverPositionRef = useRef<Coordinate | null>(null);
  const driverAnimationRef = useRef<number | null>(null);
  const polylineRef = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const authFailureCleanupRef = useRef<(() => void) | null>(null);
  const mapIdleListenerRef = useRef<any>(null);
  const onCenterChangeRef = useRef(onCenterChange);
  const cameraInitializedRef = useRef(false);
  const lastCameraUpdateRef = useRef(0);
  const [status, setStatus] = useState<MapStatus>("loading");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    onCenterChangeRef.current = onCenterChange;
  }, [onCenterChange]);

  const origin = useMemo(() => {
    const lat = customOrigin?.lat ?? location?.latitude;
    const lng = customOrigin?.lng ?? location?.longitude;
    return isCoordinate(lat) && isCoordinate(lng) ? { lat, lng } : null;
  }, [customOrigin?.lat, customOrigin?.lng, location?.latitude, location?.longitude]);

  const destination = useMemo(() => {
    if (selectionMode) return null;
    const value = customDestination ?? globalDestination;
    if (!value) return null;
    const lat = "latitude" in value ? value.latitude : value.lat;
    const lng = "longitude" in value ? value.longitude : value.lng;
    return isCoordinate(lat) && isCoordinate(lng) ? { lat, lng } : null;
  }, [customDestination, globalDestination, selectionMode]);

  const validDriverLocation = useMemo<Coordinate | null>(() => {
    if (
      selectionMode ||
      !driverLocation ||
      !isCoordinate(driverLocation.lat) ||
      !isCoordinate(driverLocation.lng)
    ) {
      return null;
    }
    return { lat: driverLocation.lat, lng: driverLocation.lng };
  }, [driverLocation, selectionMode]);

  const emitMapCenter = useCallback(() => {
    if (!mapRef.current || !onCenterChangeRef.current) return;
    const center = mapRef.current.getCenter?.();
    const lat = center?.lat?.();
    const lng = center?.lng?.();
    if (isCoordinate(lat) && isCoordinate(lng)) {
      onCenterChangeRef.current({ lat, lng });
    }
  }, []);

  const initializeMap = useCallback(async (): Promise<void> => {
    if (!mapElementRef.current) return;
    setStatus("loading");

    authFailureCleanupRef.current?.();
    authFailureCleanupRef.current = null;
    mapIdleListenerRef.current?.remove?.();
    mapIdleListenerRef.current = null;

    try {
      const googleWindow = window as any;
      const previousAuthFailure = googleWindow.gm_authFailure;
      googleWindow.gm_authFailure = () => setStatus("configuration-error");
      authFailureCleanupRef.current = () => {
        googleWindow.gm_authFailure = previousAuthFailure;
      };

      const mapsLibrary = (await googleMapsLoader.importLibrary("maps")) as any;
      if (!mapElementRef.current) return;

      mapRef.current = new mapsLibrary.Map(mapElementRef.current, {
        center: origin ?? NEUTRAL_CENTER,
        zoom: origin ? 16 : NEUTRAL_ZOOM,
        disableDefaultUI: true,
        clickableIcons: false,
        gestureHandling: isStatic ? "none" : "greedy",
        keyboardShortcuts: !isStatic,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        backgroundColor: "#171a21",
        styles: DARK_MAP_STYLES,
      });

      if (selectionMode) {
        mapIdleListenerRef.current = mapRef.current.addListener("idle", emitMapCenter);
        window.setTimeout(emitMapCenter, 0);
      }

      cameraInitializedRef.current = false;
      driverPositionRef.current = null;

      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = new ResizeObserver(() => {
        const maps = (window as any).google?.maps;
        if (maps?.event && mapRef.current) maps.event.trigger(mapRef.current, "resize");
      });
      if (containerRef.current) resizeObserverRef.current.observe(containerRef.current);

      setStatus("ready");
    } catch (error) {
      console.error("[PassengerMap] Google Maps initialization failed", {
        name: error instanceof Error ? error.name : "UnknownError",
        code: error instanceof Error ? error.message : "maps_unknown_error",
      });
      const code = error instanceof Error ? error.message : "";
      const isConfigError = code.includes("configuration_missing") || code.includes("api_key_empty");
      setStatus(isConfigError ? "configuration-error" : "api-error");
    }
  }, [emitMapCenter, isStatic, origin, reloadKey, selectionMode]);

  useEffect(() => {
    void initializeMap();
    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      authFailureCleanupRef.current?.();
      authFailureCleanupRef.current = null;
      mapIdleListenerRef.current?.remove?.();
      mapIdleListenerRef.current = null;
      if (driverAnimationRef.current !== null) cancelAnimationFrame(driverAnimationRef.current);
    };
  }, [initializeMap]);

  useEffect(() => {
    if (!mapRef.current || status !== "ready") return;
    const maps = (window as any).google?.maps;
    if (!maps) return;

    for (const marker of staticMarkersRef.current) marker.setMap(null);
    staticMarkersRef.current = [];
    polylineRef.current?.setMap(null);
    polylineRef.current = null;

    if (selectionMode) {
      if (!cameraInitializedRef.current) {
        mapRef.current.setCenter(origin ?? NEUTRAL_CENTER);
        mapRef.current.setZoom(origin ? 16 : NEUTRAL_ZOOM);
        cameraInitializedRef.current = true;
        emitMapCenter();
      }
      return;
    }

    const bounds = new maps.LatLngBounds();
    let pointCount = 0;

    const addCircleMarker = (
      position: Coordinate,
      title: string,
      color: string,
      scale = 8,
    ) => {
      const marker = new maps.Marker({
        map: mapRef.current,
        position,
        title,
        optimized: true,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
      staticMarkersRef.current.push(marker);
      bounds.extend(position);
      pointCount += 1;
    };

    if (origin) addCircleMarker(origin, "Sua localização", "#FFB800");

    orderedStops.forEach((stop, index) => {
      if (!isCoordinate(stop.latitude) || !isCoordinate(stop.longitude)) return;
      const position = { lat: stop.latitude, lng: stop.longitude };
      const marker = new maps.Marker({
        map: mapRef.current,
        position,
        title: stop.label,
        label: { text: String(index + 1), color: "#000000", fontWeight: "700" },
        optimized: true,
      });
      staticMarkersRef.current.push(marker);
      bounds.extend(position);
      pointCount += 1;
    });

    if (destination) addCircleMarker(destination, "Destino", "#111111", 9);

    if (route?.decodedPoints && route.decodedPoints.length > 1) {
      const path = route.decodedPoints.map((point) => ({ lat: point.lat, lng: point.lng }));
      polylineRef.current = new maps.Polyline({
        map: mapRef.current,
        path,
        geodesic: true,
        strokeColor: "#FFB800",
        strokeOpacity: 1,
        strokeWeight: 5,
      });
      path.forEach((point) => bounds.extend(point));
      pointCount += path.length;
    }

    if (validDriverLocation) {
      bounds.extend(validDriverLocation);
      pointCount += 1;
    }

    if (pointCount > 1) {
      mapRef.current.fitBounds(bounds, { top: 170, right: 40, bottom: 330, left: 40 });
    } else if (origin) {
      mapRef.current.setCenter(origin);
      mapRef.current.setZoom(16);
    } else {
      mapRef.current.setCenter(NEUTRAL_CENTER);
      mapRef.current.setZoom(NEUTRAL_ZOOM);
    }

    cameraInitializedRef.current = true;
  }, [destination, emitMapCenter, orderedStops, origin, route?.decodedPoints, selectionMode, status, validDriverLocation]);

  useEffect(() => {
    if (!mapRef.current || status !== "ready" || selectionMode) return;
    const maps = (window as any).google?.maps;
    if (!maps) return;

    if (!validDriverLocation) {
      driverMarkerRef.current?.setMap(null);
      driverMarkerRef.current = null;
      driverPositionRef.current = null;
      return;
    }

    const heading = isCoordinate(driverLocation?.heading) ? driverLocation.heading : 0;
    const icon = {
      path: maps.SymbolPath.FORWARD_CLOSED_ARROW,
      scale: 6,
      rotation: heading,
      fillColor: "#2563eb",
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 2,
      anchor: new maps.Point(0, 2),
    };

    if (!driverMarkerRef.current) {
      driverMarkerRef.current = new maps.Marker({
        map: mapRef.current,
        position: validDriverLocation,
        title: "Motorista",
        zIndex: 50,
        optimized: true,
        icon,
      });
      driverPositionRef.current = validDriverLocation;
    } else {
      driverMarkerRef.current.setIcon(icon);
      driverMarkerRef.current.setMap(mapRef.current);

      const start = driverPositionRef.current ?? validDriverLocation;
      const target = validDriverLocation;
      const startedAt = performance.now();

      if (driverAnimationRef.current !== null) cancelAnimationFrame(driverAnimationRef.current);

      const animate = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / DRIVER_ANIMATION_MS);
        const position = interpolateCoordinate(start, target, easeOutCubic(progress));
        driverMarkerRef.current?.setPosition(position);
        driverPositionRef.current = position;

        if (progress < 1) {
          driverAnimationRef.current = requestAnimationFrame(animate);
        } else {
          driverPositionRef.current = target;
          driverAnimationRef.current = null;
        }
      };

      driverAnimationRef.current = requestAnimationFrame(animate);
    }

    const now = Date.now();
    if (
      !isStatic &&
      cameraInitializedRef.current &&
      now - lastCameraUpdateRef.current >= CAMERA_UPDATE_INTERVAL_MS
    ) {
      lastCameraUpdateRef.current = now;

      if (origin) {
        const midpoint = {
          lat: (origin.lat + validDriverLocation.lat) / 2,
          lng: (origin.lng + validDriverLocation.lng) / 2,
        };
        mapRef.current.panTo(midpoint);
      } else {
        mapRef.current.panTo(validDriverLocation);
      }
    }
  }, [driverLocation?.heading, isStatic, origin, selectionMode, status, validDriverLocation]);

  const retry = () => {
    googleMapsLoader.reset();
    mapRef.current = null;
    driverMarkerRef.current = null;
    driverPositionRef.current = null;
    cameraInitializedRef.current = false;
    setReloadKey((value) => value + 1);
  };

  return (
    <div ref={containerRef} className="relative h-full min-h-[320px] w-full overflow-hidden bg-[#171a21]">
      <div ref={mapElementRef} className="absolute inset-0 h-full w-full" aria-label={selectionMode ? "Mapa para escolher o destino" : "Mapa da corrida"} />

      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#171a21]/90">
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-white/8 bg-[#111318]/95 px-6 py-5 shadow-xl">
            <div className="h-9 w-9 animate-spin rounded-full border-4 border-zinc-700 border-t-apois-yellow" />
            <p className="text-xs font-bold text-zinc-300">Carregando mapa...</p>
          </div>
        </div>
      )}

      {(status === "configuration-error" || status === "api-error") && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-zinc-950/90 p-6 text-center">
          <div className="max-w-xs space-y-4 rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl">
            <p className="text-sm font-black uppercase tracking-tight text-apois-yellow">Mapa indisponível</p>
            <p className="text-xs leading-relaxed text-zinc-300">
              {status === "configuration-error"
                ? "A configuração do Google Maps está ausente ou não autorizada para este ambiente."
                : "Não foi possível carregar o mapa. Verifique a conexão e tente novamente."}
            </p>
            <button
              type="button"
              onClick={retry}
              className="mx-auto flex items-center gap-2 rounded-xl bg-apois-yellow px-4 py-3 text-xs font-black text-black"
            >
              <RefreshCw size={16} /> Tentar novamente
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PassengerMap;
