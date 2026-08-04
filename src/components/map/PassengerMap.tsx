import React, { useEffect, useRef } from "react";
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

const PassengerMap: React.FC<PassengerMapProps> = ({ 
  origin: customOrigin, 
  destination: customDestination,
  encodedPolyline,
  driverLocation,
  isStatic 
}) => {
  const { location } = useLocation();
  const { route } = useRoute();
  const { orderedStops } = useRideStops();
  const { destination: globalDestination } = useDestination();
  
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  const currentLat = customOrigin?.lat || location?.latitude;
  const currentLng = customOrigin?.lng || location?.longitude;
  const targetDest = customDestination || globalDestination;

  useEffect(() => {
    const initMap = async () => {
      if (!mapRef.current) return;
      
      const mapsLib = await googleMapsLoader.importLibrary('maps') as google.maps.MapsLibrary;
      
      if (!googleMapRef.current) {
        googleMapRef.current = new mapsLib.Map(mapRef.current, {
          center: { lat: currentLat || -23.5505, lng: currentLng || -46.6333 },
          zoom: 15,
          disableDefaultUI: true,
          styles: [
            {
              "elementType": "geometry",
              "stylers": [{ "color": "#212121" }]
            },
            {
              "elementType": "labels.icon",
              "stylers": [{ "visibility": "off" }]
            },
            {
              "elementType": "labels.text.fill",
              "stylers": [{ "color": "#757575" }]
            },
            {
              "elementType": "labels.text.stroke",
              "stylers": [{ "color": "#212121" }]
            },
            {
              "featureType": "administrative",
              "elementType": "geometry",
              "stylers": [{ "color": "#757575" }]
            },
            {
              "featureType": "poi",
              "elementType": "labels.text.fill",
              "stylers": [{ "color": "#757575" }]
            },
            {
              "featureType": "road",
              "elementType": "geometry.fill",
              "stylers": [{ "color": "#2c2c2c" }]
            },
            {
              "featureType": "road",
              "elementType": "labels.text.fill",
              "stylers": [{ "color": "#8a8a8a" }]
            },
            {
              "featureType": "water",
              "elementType": "geometry",
              "stylers": [{ "color": "#000000" }]
            }
          ]
        });
      }
    };

    initMap();
  }, []);

  useEffect(() => {
    if (!googleMapRef.current) return;

    // Clear old markers
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    // Clear old polyline
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    const bounds = new google.maps.LatLngBounds();
    let hasPoints = false;

    // Origin
    if (currentLat && currentLng) {
      const pos = { lat: currentLat, lng: currentLng };
      const marker = new google.maps.Marker({
        position: pos,
        map: googleMapRef.current,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: '#3B82F6',
          fillOpacity: 1,
          strokeColor: 'white',
          strokeWeight: 2
        },
        title: 'Origem'
      });
      markersRef.current.push(marker);
      bounds.extend(pos);
      hasPoints = true;
    }

    // Stops
    orderedStops.forEach((stop, index) => {
      const pos = { lat: stop.latitude, lng: stop.longitude };
      const marker = new google.maps.Marker({
        position: pos,
        map: googleMapRef.current,
        label: {
          text: (index + 1).toString(),
          color: 'white',
          fontWeight: 'bold'
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#4B5563',
          fillOpacity: 1,
          strokeColor: 'white',
          strokeWeight: 2
        },
        title: stop.label
      });
      markersRef.current.push(marker);
      bounds.extend(pos);
      hasPoints = true;
    });

    // Destination
    if (targetDest) {
      const pos = { lat: targetDest.latitude, lng: targetDest.longitude };
      const marker = new google.maps.Marker({
        position: pos,
        map: googleMapRef.current,
        icon: {
          url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png'
        },
        title: 'Destino'
      });
      markersRef.current.push(marker);
      bounds.extend(pos);
      hasPoints = true;
    }

    // Polyline
    if (route?.decodedPoints && route.decodedPoints.length > 1) {
      const path = route.decodedPoints.map(p => ({ lat: p.lat, lng: p.lng }));
      polylineRef.current = new google.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: '#FACC15',
        strokeOpacity: 1.0,
        strokeWeight: 4,
        map: googleMapRef.current
      });
      
      path.forEach(p => bounds.extend(p));
      hasPoints = true;
    }

    if (hasPoints) {
      // Padding para o painel inferior (bottom panel tem aprox 200-300px)
      googleMapRef.current.fitBounds(bounds, {
        top: 100,
        right: 50,
        bottom: 350,
        left: 50
      });
    }
  }, [currentLat, currentLng, targetDest, orderedStops, route]);

  return (
    <div className="w-full h-full bg-zinc-900 overflow-hidden relative">
      <div ref={mapRef} className="w-full h-full" />
      
      {!currentLat && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
          <div className="bg-[#1e1e1e] p-6 rounded-3xl border border-white/5 text-center space-y-4 max-w-[80%]">
            <p className="text-sm font-medium text-gray-300">
              Precisamos identificar sua localização antes de calcular a rota.
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-apois-yellow text-black font-black rounded-xl active:scale-95 transition-all"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PassengerMap;
