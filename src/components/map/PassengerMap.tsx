import React, { useEffect, useRef } from "react";
import { useLocation } from "@/hooks/use-location";
import { useRoute } from "@/hooks/use-route";
import { useRideStops } from "@/hooks/rides/use-ride-stops";
import { useDestination } from "@/hooks/use-destination";
import { googleMapsLoader } from "@/services/google/google-maps-loader";
import { MapPin } from "lucide-react";

interface PassengerMapProps {
  origin: { lat: number; lng: number } | undefined;
  destination: { lat: number; lng: number } | undefined;
  encodedPolyline: string | undefined;
  driverLocation: { lat: number; lng: number; heading?: number } | undefined;
  isStatic: boolean | undefined;
}

const PassengerMap: React.FC<PassengerMapProps> = ({
  origin: customOrigin,
  destination: customDestination,
  encodedPolyline,
  driverLocation,
  isStatic,
}) => {
  const { location } = useLocation();
  const { route } = useRoute();
  const { orderedStops } = useRideStops();
  const { destination: globalDestination } = useDestination();

  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const [mapStatus, setMapStatus] = React.useState<
    "loading" | "ready" | "configuration-error" | "api-error"
  >("loading");

  const hasValidCoordinate = (val: number | undefined | null): val is number => typeof val === "number" && Number.isFinite(val);

  const currentLat = customOrigin?.lat || location?.latitude;
  const currentLng = customOrigin?.lng || location?.longitude;
  const hasValidOrigin = hasValidCoordinate(currentLat) && hasValidCoordinate(currentLng);
  const targetDest = customDestination || globalDestination;

  useEffect(() => {
    let mounted = true;
    const initMap = async () => {
      if (!mapRef.current) return;

      try {
        setMapStatus("loading");
        console.log("[PassengerMap] Initializing Google Maps JS API...");
        const mapsLib = (await googleMapsLoader.importLibrary("maps"));

        if (!mounted) return;

        if (!googleMapRef.current) {
          googleMapRef.current = new mapsLib.Map(mapRef.current, {
            center: {
              lat: hasValidOrigin ? currentLat! : -23.5505,
              lng: hasValidOrigin ? currentLng! : -46.6333,
            },
            zoom: 15,
            disableDefaultUI: true,
            backgroundColor: "#121212",
            styles: [
              {
                elementType: "geometry",
                stylers: [{ color: "#121212" }],
              },
              {
                elementType: "labels.icon",
                stylers: [{ visibility: "off" }],
              },
              {
                elementType: "labels.text.fill",
                stylers: [{ color: "#9e9e9e" }],
              },
              {
                elementType: "labels.text.stroke",
                stylers: [{ color: "#121212" }],
              },
              {
                featureType: "administrative",
                elementType: "geometry",
                stylers: [{ color: "#424242" }],
              },
              {
                featureType: "poi",
                elementType: "labels.text.fill",
                stylers: [{ color: "#757575" }],
              },
              {
                featureType: "road",
                elementType: "geometry.fill",
                stylers: [{ color: "#2c2c2c" }],
              },
              {
                featureType: "road",
                elementType: "labels.text.fill",
                stylers: [{ color: "#8a8a8a" }],
              },
              {
                featureType: "water",
                elementType: "geometry",
                stylers: [{ color: "#0a0a0a" }],
              },
            ],
          });
          setMapStatus("ready");
          console.log("[PassengerMap] Map instance created successfully");
        }
      } catch (err: unknown) {
        const error = err as Error;
        console.error("[PassengerMap] Error loading Google Maps:", error);
        if (error.message === "places_configuration_missing") {
          setMapStatus("configuration-error");
        } else {
          setMapStatus("api-error");
        }
      }
    };

    void initMap();
    return () => {
      mounted = false;
    };
  }, [hasValidOrigin]); // Recria se a validade da origem mudar inicialmente

  useEffect(() => {
    if (!googleMapRef.current || mapStatus !== "ready") return;

    // Clear old markers
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    // Clear old polyline
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    const bounds = new (window as any).google.maps.LatLngBounds();
    let hasPoints = false;

    // Origin
    if (hasValidOrigin) {
      const pos = { lat: currentLat!, lng: currentLng! };
      const marker = new (window as any).google.maps.Marker({
        position: pos,
        map: googleMapRef.current,
        icon: {
          path: (window as any).google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: "#FFB800", // Amarelo APOIS
          fillOpacity: 1,
          strokeColor: "white",
          strokeWeight: 2,
        },
        title: "Origem",
      });
      markersRef.current.push(marker);
      bounds.extend(pos);
      hasPoints = true;
    }

    // Stops
    orderedStops.forEach((stop, index) => {
      const hasValidStop = hasValidCoordinate(stop.latitude) && hasValidCoordinate(stop.longitude);
      if (!hasValidStop) return;

      const pos = { lat: stop.latitude, lng: stop.longitude };
      const marker = new (window as any).google.maps.Marker({
        position: pos,
        map: googleMapRef.current,
        label: {
          text: (index + 1).toString(),
          color: "black",
          fontWeight: "bold",
        },
        icon: {
          path: (window as any).google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#FFB800",
          fillOpacity: 1,
          strokeColor: "white",
          strokeWeight: 2,
        },
        title: stop.label,
      });
      markersRef.current.push(marker);
      bounds.extend(pos);
      hasPoints = true;
    });

    // Destination
    if (targetDest) {
      const destLat = "latitude" in targetDest ? targetDest.latitude : targetDest.lat;
      const destLng = "longitude" in targetDest ? targetDest.longitude : targetDest.lng;

      if (hasValidCoordinate(destLat) && hasValidCoordinate(destLng)) {
        const pos = { lat: destLat as number, lng: destLng as number };

        const marker = new (window as any).google.maps.Marker({
          position: pos,
          map: googleMapRef.current,
          icon: {
            url: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
          },
          title: "Destino",
        });
        markersRef.current.push(marker);
        bounds.extend(pos);
        hasPoints = true;
      }
    }

    // Polyline
    if (route?.decodedPoints && route.decodedPoints.length > 1) {
      const path = route.decodedPoints.map((p) => ({ lat: p.lat, lng: p.lng }));
      polylineRef.current = new (window as any).google.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: "#FFB800", // Amarelo APOIS
        strokeOpacity: 1.0,
        strokeWeight: 5,
        map: googleMapRef.current,
      });

      path.forEach((p) => bounds.extend(p));
      hasPoints = true;
    }

    if (hasPoints) {
      googleMapRef.current.fitBounds(bounds, {
        top: 150,
        right: 50,
        bottom: 400,
        left: 50,
      });
    }
  }, [currentLat, currentLng, targetDest, orderedStops, route, mapStatus, hasValidOrigin]);

  return (
    <div
      className="w-full h-full bg-zinc-950 overflow-hidden relative flex items-center justify-center"
      style={{ minHeight: "100%" }}
    >
      {/* Fallback do Mapa (Sempre visível se o Google não carregar) */}
      <div className="absolute inset-0 z-0 bg-zinc-950 flex flex-col items-center justify-center">
        <div className="w-full h-full opacity-10" style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, #333 1px, transparent 0)`,
          backgroundSize: '32px 32px'
        }} />
        <div className="absolute inset-0 flex items-center justify-center">
           <div className="w-16 h-16 border-4 border-zinc-800 border-t-apois-yellow rounded-full animate-spin" />
        </div>
      </div>

      <div
        ref={mapRef}
        className="w-full h-full absolute inset-0 z-10"
        style={{ background: "transparent" }}
      />

      {mapStatus === "configuration-error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20 p-6 text-center">
          <div className="max-w-xs space-y-4">
            <p className="text-apois-yellow font-black uppercase tracking-tighter text-sm">
              Erro de Configuração
            </p>
            <p className="text-zinc-400 text-xs">
              {import.meta.env.DEV
                ? "Google Maps não configurado neste ambiente (VITE_GOOGLE_MAPS_API_KEY ausente)."
                : "Não foi possível carregar o mapa agora."}
            </p>
          </div>
        </div>
      )}

      {mapStatus === "api-error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20 p-6 text-center">
          <div className="max-w-xs space-y-4">
            <p className="text-red-500 font-black uppercase tracking-tighter text-sm">
              Falha na API
            </p>
            <p className="text-zinc-400 text-xs">Erro ao carregar os serviços do Google Maps.</p>
          </div>
        </div>
      )}

      {mapStatus === "loading" && !hasValidOrigin && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
          <div className="bg-[#1e1e1e] p-6 rounded-3xl border border-white/5 text-center space-y-4 max-w-[80%] animate-in fade-in duration-500">
            <p className="text-sm font-medium text-gray-300">Identificando sua localização...</p>
            <div className="w-8 h-8 border-4 border-apois-yellow border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        </div>
      )}
    </div>
  );
};

export default PassengerMap;
