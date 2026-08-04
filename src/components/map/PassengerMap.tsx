import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from '../../hooks/use-location';
import { mapService } from '../../services/maps/map-service';
import { MapState, MapError } from '../../types/map';
import { Button } from '../ui/button';
import { Target, Loader2, MapPinOff, Lock } from 'lucide-react';
import { DEFAULT_ZOOM } from '../../services/maps/map-config';

interface PassengerMapProps {
  className?: string;
}

const PassengerMap: React.FC<PassengerMapProps> = ({ className }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapId] = useState(`map-${Math.random().toString(36).substr(2, 9)}`);
  const { currentPosition, permissionStatus, isLoading: isLocationLoading } = useLocation();
  const [state, setState] = useState<MapState>('idle');
  const [error, setError] = useState<MapError | null>(null);
  const [isManualMove, setIsManualMove] = useState(false);
  const mapInitialized = useRef(false);

  const apiKey = import.meta.env['VITE_GOOGLE_MAPS_API_KEY'];

  useEffect(() => {
    if (!mapRef.current || mapInitialized.current) return;

    const initMap = async () => {
      if (!apiKey) {
        setState('configuration_missing');
        setError(mapService.normalizeError('maps_configuration_missing'));
        return;
      }

      if (permissionStatus !== 'granted') {
        setState('permission_required');
        return;
      }

      if (!currentPosition) {
        setState('loading');
        return;
      }

      try {
        setState('loading');
        await mapService.createMap(mapRef.current!, apiKey, {
          lat: currentPosition.latitude,
          lng: currentPosition.longitude,
        });
        
        await mapService.updatePassengerMarker(mapId, {
          lat: currentPosition.latitude,
          lng: currentPosition.longitude,
        });

        mapInitialized.current = true;
        setState('ready');
      } catch (err: any) {
        setState('failed');
        setError(err);
      }
    };

    initMap();

    return () => {
      if (mapInitialized.current) {
        mapService.destroyMap(mapId);
        mapInitialized.current = false;
      }
    };
  }, [mapRef, currentPosition, permissionStatus, apiKey, mapId]);

  // Update marker when location changes
  useEffect(() => {
    if (state === 'ready' && currentPosition) {
      mapService.updatePassengerMarker(mapId, {
        lat: currentPosition.latitude,
        lng: currentPosition.longitude,
      });

      // Auto-recenter only if not manual move
      if (!isManualMove) {
        mapService.setCamera(mapId, {
          coordinate: { lat: currentPosition.latitude, lng: currentPosition.longitude },
          zoom: DEFAULT_ZOOM
        });
      }
    }
  }, [currentPosition, state, mapId, isManualMove]);

  const handleRecenter = async () => {
    if (currentPosition && state === 'ready') {
      setIsManualMove(false);
      await mapService.setCamera(mapId, {
        coordinate: { lat: currentPosition.latitude, lng: currentPosition.longitude },
        zoom: DEFAULT_ZOOM
      });
    }
  };

  const renderOverlay = () => {
    if (state === 'loading' || isLocationLoading) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20 backdrop-blur-sm z-10">
          <Loader2 className="w-10 h-10 text-apois-yellow animate-spin mb-2" />
          <p className="text-white font-medium">Carregando mapa...</p>
        </div>
      );
    }

    if (state === 'configuration_missing') {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 p-6 text-center z-10">
          <Lock className="w-12 h-12 text-apois-yellow mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Configuração Ausente</h3>
          <p className="text-zinc-400">{error?.message}</p>
        </div>
      );
    }

    if (state === 'permission_required' || permissionStatus === 'denied' || permissionStatus === 'blocked') {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 p-6 text-center z-10">
          <MapPinOff className="w-12 h-12 text-apois-yellow mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Acesso à Localização</h3>
          <p className="text-zinc-400 mb-6">Precisamos da sua localização para mostrar o mapa corretamente.</p>
        </div>
      );
    }

    if (state === 'failed') {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 p-6 text-center z-10">
          <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
            <span className="text-2xl text-red-500">!</span>
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Ops! Algo deu errado</h3>
          <p className="text-zinc-400 mb-6">{error?.message}</p>
          <Button onClick={() => window.location.reload()} variant="outline" className="border-apois-yellow text-apois-yellow">
            Tentar Novamente
          </Button>
        </div>
      );
    }

    return null;
  };

  return (
    <div className={`relative w-full h-full ${className}`}>
      <div 
        id={mapId}
        ref={mapRef}
        className="w-full h-full bg-zinc-800"
        onTouchStart={() => setIsManualMove(true)}
      />
      
      {renderOverlay()}

      {state === 'ready' && (
        <button
          onClick={handleRecenter}
          aria-label="Recentrar mapa"
          className="absolute right-4 bottom-24 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center text-zinc-800 active:scale-95 transition-transform z-20"
        >
          <Target className="w-6 h-6" />
        </button>
      )}
    </div>
  );
};

export default PassengerMap;
