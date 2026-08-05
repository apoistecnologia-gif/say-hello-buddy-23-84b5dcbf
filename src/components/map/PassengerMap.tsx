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
}

type MapStatus = "loading" | "ready" | "configuration-error" | "api-error";

const DEFAULT_CENTER = { lat: -9.3891, lng: -40.5031 };

const isCoordinate = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const PassengerMap: React.FC<PassengerMapProps> = ({
  origin: customOrigin,
  destination: customDestination,
  driverLocation,
  isStatic = false,
}) => {
  const { location } = useLocation();
  const { route } = useRoute();
  const { orderedStops } = useRideStops();
  const { destination: globalDestination } = useDestination();

  const containerRef = useRef<HTMLDivElement>(null);
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const polylineRef = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [status, setStatus] = useState<MapStatus>("loading");
  const [reloadKey, setReloadKey] = useState(0);

  const origin = useMemo(() => {
    const lat = customOrigin?.lat ?? location?.latitude;
    const lng = customOrigin?.lng ?? location?.longitude;
    return isCoordinate(lat) && isCoordinate(lng) ? { lat, lng } : null;
  }, [customOrigin?.lat, customOrigin?.lng, location?.latitude, location?.longitude]);

  const destination = useMemo(() => {
    const value = customDestination ?? globalDestination;
    if (!value) return null;
    const lat = "latitude" in value ? value.latitude : value.lat;
    const lng = "longitude" in value ? value.longitude : value.lng;
    return isCoordinate(lat) && isCoordinate(lng) ? { lat, lng } : null;
  }, [customDestination, globalDestination]);

  const initializeMap = useCallback(async () => {
    if (!mapElementRef.current) return;
    setStatus("loading");

    try {
      const googleWindow = window as any;
      const previousAuthFailure = googleWindow.gm_authFailure;
      googleWindow.gm_authFailure = () => setStatus("configuration-error");

      const mapsLibrary = (await googleMapsLoader.importLibrary("maps")) as any;
      if (!mapElementRef.current) return;

      mapRef.current = new mapsLibrary.Map(mapElementRef.current, {
        center: origin ?? DEFAULT_CENTER,
        zoom: origin ? 16 : 13,
        disableDefaultUI: true,
        clickableIcons: false,
        gestureHandling: isStatic ? "none" : "greedy",
        keyboardShortcuts: !isStatic,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        backgroundColor: "#e5e7eb",
      });

      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = new ResizeObserver(() => {
        const maps = (window as any).google?.maps;
        if (maps?.event && mapRef.current) maps.event.trigger(mapRef.current, "resize");
      });
      if (containerRef.current) resizeObserverRef.current.observe(containerRef.current);

      setStatus("ready");
      return () => {
        googleWindow.gm_authFailure = previousAuthFailure;
      };
    } catch (error) {
      console.error("[PassengerMap] Google Maps initialization failed", {
        name: error instanceof Error ? error.name : "UnknownError",
        code: error instanceof Error ? error.message : "maps_unknown_error",
      });
      const code = error instanceof Error ? error.message : "";
      setStatus(code.includes("configuration_missing") ? "configuration-error" : "api-error");
    }
  }, [isStatic, origin, reloadKey]);

  useEffect(() => {
    void initializeMap();
    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    };
  }, [initializeMap]);

  useEffect(() => {
    if (!mapRef.current || status !== "ready") return;
    const maps = (window as any).google?.maps;
    if (!maps) return;

    for (const marker of markersRef.current) marker.setMap(null);
    markersRef.current = [];
    polylineRef.current?.setMap(null);
    polylineRef.current = null;

    const bounds = new maps.LatLngBounds();
    let pointCount = 0;

    const addCircleMarker = (
      position: { lat: number; lng: number },
      title: string,
      color: string,
      scale = 8,
    ) => {
      const marker = new maps.Marker({
        map: mapRef.current,
        position,
        title,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
      markersRef.current.push(marker);
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
      });
      markersRef.current.push(marker);
      bounds.extend(position);
      pointCount += 1;
    });

    if (destination) addCircleMarker(destination, "Destino", "#111111", 9);
    if (driverLocation && isCoordinate(driverLocation.lat) && isCoordinate(driverLocation.lng)) {
      addCircleMarker(driverLocation, "Motorista", "#2563eb", 8);
    }

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

    if (pointCount > 1) {
      mapRef.current.fitBounds(bounds, { top: 170, right: 40, bottom: 330, left: 40 });
    } else if (origin) {
      mapRef.current.setCenter(origin);
      mapRef.current.setZoom(16);
    } else {
      mapRef.current.setCenter(DEFAULT_CENTER);
      mapRef.current.setZoom(13);
    }
  }, [destination, driverLocation, orderedStops, origin, route?.decodedPoints, status]);

  const retry = () => {
    googleMapsLoader.reset();
    mapRef.current = null;
    setReloadKey((value) => value + 1);
  };

  return (
    <div ref={containerRef} className="relative h-full min-h-[320px] w-full overflow-hidden bg-zinc-200">
      <div ref={mapElementRef} className="absolute inset-0 h-full w-full" aria-label="Mapa da corrida" />

      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-zinc-100/90">
          <div className="flex flex-col items-center gap-3 rounded-3xl bg-white/95 px-6 py-5 shadow-xl">
            <div className="h-9 w-9 animate-spin rounded-full border-4 border-zinc-200 border-t-apois-yellow" />
            <p className="text-xs font-bold text-zinc-700">Carregando mapa...</p>
          </div>
        </div>
      )}

      {(status === "configuration-error" || status === "api-error") && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-zinc-950/90 p-6 text-center">
          <div className="max-w-xs space-y-4 rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl">
            <p className="text-sm font-black uppercase tracking-tight text-apois-yellow">Mapa indisponível</p>
            <p className="text-xs leading-relaxed text-zinc-300">
              {status === "configuration-error"
                ? "A chave do Google Maps para Web está ausente ou não autorizada para este domínio."
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
