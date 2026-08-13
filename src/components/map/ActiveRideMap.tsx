import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { googleMapsLoader } from "@/services/google/google-maps-loader";
import { decodePolyline } from "@/services/routes/polyline-decoder";
import type { ActiveRide } from "@/types/rides/active-ride";

type MapStatus = "loading" | "ready" | "configuration-error" | "api-error";
type Coordinate = { lat: number; lng: number };
type StaticStop = { lat: number; lng: number; order?: number; label?: string };

interface ActiveRideMapProps {
  ride: ActiveRide;
}

const DARK_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#171a21" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#171a21" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8f96a3" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#c7cbd3" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#8d939f" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#17231e" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#252a33" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#15181e" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#a5aab3" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#343943" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d2532" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#67808c" }] },
];

const ROUTE_VIEW_PADDING = {
  top: 76,
  right: 28,
  bottom: 92,
  left: 28,
};

const APPROACH_VIEW_PADDING = {
  top: 72,
  right: 28,
  bottom: 86,
  left: 28,
};

const validCoordinate = (coordinate: Coordinate): boolean =>
  Number.isFinite(coordinate.lat) &&
  Number.isFinite(coordinate.lng) &&
  coordinate.lat >= -90 &&
  coordinate.lat <= 90 &&
  coordinate.lng >= -180 &&
  coordinate.lng <= 180;

export function ActiveRideMap({ ride }: ActiveRideMapProps) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const routePolylineRef = useRef<any>(null);
  const staticMarkersRef = useRef<any[]>([]);
  const driverMarkerRef = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const firstDriverViewportRef = useRef(false);
  const [status, setStatus] = useState<MapStatus>("loading");
  const [reloadKey, setReloadKey] = useState(0);

  const origin = useMemo<Coordinate>(
    () => ({ lat: ride.origin.lat, lng: ride.origin.lng }),
    [ride.origin.lat, ride.origin.lng],
  );
  const destination = useMemo<Coordinate>(
    () => ({ lat: ride.destination.lat, lng: ride.destination.lng }),
    [ride.destination.lat, ride.destination.lng],
  );

  const stopsSignature = JSON.stringify(
    (ride.intermediates ?? []).map((stop) => ({
      lat: stop.lat,
      lng: stop.lng,
      order: stop.order ?? 0,
      label: stop.label ?? "",
    })),
  );
  const orderedStops = useMemo<StaticStop[]>(() => {
    try {
      const parsed = JSON.parse(stopsSignature) as StaticStop[];
      return parsed.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    } catch {
      return [];
    }
  }, [stopsSignature]);

  const driverLocation = useMemo<Coordinate | null>(() => {
    if (ride.queued_after_ride_id) return null;
    if (
      typeof ride.driver_latitude !== "number" ||
      typeof ride.driver_longitude !== "number"
    ) {
      return null;
    }

    const coordinate = {
      lat: ride.driver_latitude,
      lng: ride.driver_longitude,
    };
    return validCoordinate(coordinate) ? coordinate : null;
  }, [ride.driver_latitude, ride.driver_longitude, ride.queued_after_ride_id]);

  const routePoints = useMemo<Coordinate[]>(() => {
    if (ride.encoded_polyline) {
      try {
        const decoded = decodePolyline(ride.encoded_polyline).filter(validCoordinate);
        if (decoded.length > 1) return decoded;
      } catch (error) {
        console.warn("[ActiveRideMap] Stored polyline could not be decoded", {
          rideId: ride.id,
          message: error instanceof Error ? error.message : "invalid_polyline",
        });
      }
    }

    return [
      origin,
      ...orderedStops.map(({ lat, lng }) => ({ lat, lng })),
      destination,
    ].filter(validCoordinate);
  }, [destination, origin, orderedStops, ride.encoded_polyline, ride.id]);

  const initialize = useCallback(async () => {
    if (!mapElementRef.current) return;
    setStatus("loading");

    try {
      const mapsLibrary = (await googleMapsLoader.importLibrary("maps")) as any;
      if (!mapElementRef.current) return;

      mapRef.current = new mapsLibrary.Map(mapElementRef.current, {
        center: origin,
        zoom: 15,
        disableDefaultUI: true,
        clickableIcons: false,
        gestureHandling: "greedy",
        keyboardShortcuts: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        backgroundColor: "#171a21",
        styles: DARK_MAP_STYLES,
      });

      firstDriverViewportRef.current = false;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = new ResizeObserver(() => {
        const maps = (window as any).google?.maps;
        if (maps?.event && mapRef.current) maps.event.trigger(mapRef.current, "resize");
      });
      resizeObserverRef.current.observe(mapElementRef.current);
      setStatus("ready");
    } catch (error) {
      console.error("[ActiveRideMap] Google Maps initialization failed", {
        rideId: ride.id,
        message: error instanceof Error ? error.message : "maps_unknown_error",
      });
      const message = error instanceof Error ? error.message : "";
      setStatus(
        message.includes("configuration_missing") || message.includes("api_key_empty")
          ? "configuration-error"
          : "api-error",
      );
    }
  }, [reloadKey, origin, ride.id]);

  useEffect(() => {
    void initialize();
    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      routePolylineRef.current?.setMap(null);
      staticMarkersRef.current.forEach((marker) => marker.setMap(null));
      driverMarkerRef.current?.setMap(null);
      driverMarkerRef.current = null;
      mapRef.current = null;
    };
  }, [initialize]);

  // Geometria estática da corrida. Este efeito NÃO depende da localização do
  // motorista; assim, cada atualização Realtime move somente o marcador e não
  // recria polyline/markers nem refaz fitBounds.
  useEffect(() => {
    if (status !== "ready" || !mapRef.current) return;
    const maps = (window as any).google?.maps;
    if (!maps) return;

    routePolylineRef.current?.setMap(null);
    routePolylineRef.current = null;
    staticMarkersRef.current.forEach((marker) => marker.setMap(null));
    staticMarkersRef.current = [];

    const bounds = new maps.LatLngBounds();
    routePoints.forEach((point) => bounds.extend(point));

    if (routePoints.length > 1) {
      routePolylineRef.current = new maps.Polyline({
        map: mapRef.current,
        path: routePoints,
        geodesic: true,
        strokeColor: "#FFB800",
        strokeOpacity: 1,
        strokeWeight: 5,
      });
    }

    const addMarker = (
      position: Coordinate,
      title: string,
      color: string,
      shape: "circle" | "square" = "circle",
    ) => {
      const marker = new maps.Marker({
        map: mapRef.current,
        position,
        title,
        zIndex: 20,
        icon: {
          path:
            shape === "circle"
              ? maps.SymbolPath.CIRCLE
              : "M -6,-6 6,-6 6,6 -6,6 z",
          scale: shape === "circle" ? 8 : 1,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
      staticMarkersRef.current.push(marker);
    };

    addMarker(origin, "Embarque", "#29C96F");
    orderedStops.forEach((stop, index) => {
      const position = { lat: stop.lat, lng: stop.lng };
      if (!validCoordinate(position)) return;
      const marker = new maps.Marker({
        map: mapRef.current,
        position,
        title: stop.label || `Parada ${index + 1}`,
        label: {
          text: String(index + 1),
          color: "#000000",
          fontWeight: "800",
        },
        zIndex: 21,
      });
      staticMarkersRef.current.push(marker);
      bounds.extend(position);
    });
    addMarker(destination, "Destino", "#FFB800", "square");

    if (!bounds.isEmpty()) {
      mapRef.current.fitBounds(bounds, ROUTE_VIEW_PADDING);
    }
  }, [destination, orderedStops, origin, routePoints, status]);

  // Tracking vivo: o mesmo Marker é reaproveitado. Durante a viagem, o mapa
  // acompanha a coordenada real do motorista; antes do início, apenas enquadra
  // motorista + embarque quando necessário.
  useEffect(() => {
    if (status !== "ready" || !mapRef.current) return;
    const maps = (window as any).google?.maps;
    if (!maps) return;

    if (!driverLocation) {
      driverMarkerRef.current?.setMap(null);
      driverMarkerRef.current = null;
      firstDriverViewportRef.current = false;
      return;
    }

    const icon = {
      path: maps.SymbolPath.CIRCLE,
      scale: 7,
      fillColor: "#2563EB",
      fillOpacity: 1,
      strokeColor: "#FFFFFF",
      strokeWeight: 3,
    };

    if (!driverMarkerRef.current) {
      driverMarkerRef.current = new maps.Marker({
        map: mapRef.current,
        position: driverLocation,
        title: "Motorista",
        zIndex: 60,
        icon,
      });
    } else {
      driverMarkerRef.current.setMap(mapRef.current);
      driverMarkerRef.current.setIcon(icon);
      driverMarkerRef.current.setPosition(driverLocation);
    }

    if (ride.status === "em_viagem") {
      const currentZoom = mapRef.current.getZoom?.();
      if (!firstDriverViewportRef.current || typeof currentZoom !== "number" || currentZoom < 14) {
        mapRef.current.setZoom(15);
      }
      mapRef.current.panTo(driverLocation);
      firstDriverViewportRef.current = true;
      return;
    }

    if (!firstDriverViewportRef.current) {
      firstDriverViewportRef.current = true;
      const currentBounds = mapRef.current.getBounds?.();
      if (currentBounds && !currentBounds.contains(driverLocation)) {
        const approachBounds = new maps.LatLngBounds();
        approachBounds.extend(origin);
        approachBounds.extend(driverLocation);
        mapRef.current.fitBounds(approachBounds, APPROACH_VIEW_PADDING);
      }
    }
  }, [driverLocation, origin, ride.status, status]);

  const retry = () => {
    googleMapsLoader.reset();
    setReloadKey((value) => value + 1);
  };

  return (
    <div className="relative h-full min-h-[320px] w-full overflow-hidden bg-[#171a21]">
      <div ref={mapElementRef} className="absolute inset-0 h-full w-full" aria-label="Mapa da corrida ativa" />

      {status === "loading" ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#171a21]/92">
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-white/8 bg-[#111318]/95 px-6 py-5 shadow-xl">
            <Loader2 className="animate-spin text-apois-yellow" size={30} />
            <p className="text-xs font-bold text-zinc-300">Carregando trajeto...</p>
          </div>
        </div>
      ) : null}

      {status === "configuration-error" || status === "api-error" ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-zinc-950/92 p-6 text-center">
          <div className="max-w-xs rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl">
            <p className="text-sm font-black uppercase tracking-tight text-apois-yellow">Mapa indisponível</p>
            <p className="mt-3 text-xs leading-5 text-zinc-300">
              {status === "configuration-error"
                ? "A configuração do Google Maps não foi autorizada neste ambiente."
                : "Não foi possível carregar o trajeto. Os dados da corrida continuam atualizando normalmente."}
            </p>
            <button
              type="button"
              onClick={retry}
              className="app-pressable mx-auto mt-4 flex min-h-11 items-center gap-2 rounded-xl bg-apois-yellow px-4 text-xs font-black text-black"
            >
              <RefreshCw size={16} />
              Tentar novamente
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
