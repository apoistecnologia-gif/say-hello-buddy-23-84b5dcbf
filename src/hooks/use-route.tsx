import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from './use-auth';
import { useLocation } from './use-location';
import { useDestination } from './use-destination';
import { 
  RouteResult, 
  RouteStatus, 
  RouteError, 
  RouteCoordinates 
} from '@/types/routes';
import { routeService } from '@/services/routes/route-service';
import { ROUTE_CONFIG } from '@/services/routes/route-config';

interface RouteContextType {
  route: RouteResult | null;
  status: RouteStatus;
  isLoading: boolean;
  error: RouteError | null;
  originUsed: RouteCoordinates | null;
  destinationUsed: RouteCoordinates | null;
  calculatedAt: number | null;
  isStale: boolean;
  compute: () => Promise<void>;
  retry: () => Promise<void>;
  clearRoute: () => void;
  cancel: () => void;
  refresh: () => Promise<void>;
}

const RouteContext = createContext<RouteContextType | undefined>(undefined);

export const RouteProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session } = useAuth();
  const { currentPosition } = useLocation();
  const { destination, hasDestination } = useDestination();
  
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [status, setStatus] = useState<RouteStatus>('idle');
  const [error, setError] = useState<RouteError | null>(null);
  const [isStale, setIsStale] = useState(false);
  
  const lastComputeCoords = useRef<{ origin: RouteCoordinates, destination: RouteCoordinates } | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const clearRoute = useCallback(() => {
    setRoute(null);
    setStatus('idle');
    setError(null);
    setIsStale(false);
    lastComputeCoords.current = null;
    routeService.cancelPendingRoute();
  }, []);

  const compute = useCallback(async () => {
    if (!session || !currentPosition || !destination || !destination.latitude || !destination.longitude) {
      return;
    }

    const origin: RouteCoordinates = { 
      lat: currentPosition.latitude, 
      lng: currentPosition.longitude 
    };
    const dest: RouteCoordinates = { 
      lat: destination.latitude, 
      lng: destination.longitude 
    };

    // Prevent identical requests
    const key = routeService.createRequestKey(origin, dest);
    if (status === 'loading' || (route && route.requestKey === key && !isStale)) {
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      const result = await routeService.computeRoute(origin, dest);
      setRoute(result);
      setStatus('success');
      setIsStale(false);
      lastComputeCoords.current = { origin, destination: dest };
    } catch (err: any) {
      if (err.message === 'route_cancelled') return;
      setStatus('failed');
      setError(routeService.normalizeError(err));
    }
  }, [session, currentPosition, destination, route, status, isStale]);

  const cancel = useCallback(() => {
    routeService.cancelPendingRoute();
    if (status === 'loading') {
      setStatus('idle');
    }
  }, [status]);

  const retry = useCallback(async () => {
    await compute();
  }, [compute]);

  const refresh = useCallback(async () => {
    setIsStale(true);
    await compute();
  }, [compute]);

  // Handle destination changes
  useEffect(() => {
    if (!hasDestination) {
      clearRoute();
      return;
    }

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    
    setStatus('debouncing');
    debounceTimer.current = setTimeout(() => {
      compute();
    }, ROUTE_CONFIG.DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [destination?.placeId, hasDestination, compute, clearRoute]);

  // Handle origin updates (displacement check)
  useEffect(() => {
    if (!currentPosition || !lastComputeCoords.current || !route) return;

    const distance = calculateDistance(
      lastComputeCoords.current.origin.lat,
      lastComputeCoords.current.origin.lng,
      currentPosition.latitude,
      currentPosition.longitude
    );

    if (distance > ROUTE_CONFIG.RELEVANT_MOVE_THRESHOLD_METERS) {
      setIsStale(true);
    }
  }, [currentPosition, route]);

  // Cleanup on logout
  useEffect(() => {
    if (!session) {
      clearRoute();
      routeService.clearCache();
    }
  }, [session, clearRoute]);

  return (
    <RouteContext.Provider
      value={{
        route,
        status,
        isLoading: status === 'loading',
        error,
        originUsed: route?.origin || null,
        destinationUsed: route?.destination || null,
        calculatedAt: route?.calculatedAt || null,
        isStale,
        compute,
        retry,
        clearRoute,
        cancel,
        refresh
      }}
    >
      {children}
    </RouteContext.Provider>
  );
};

export const useRoute = () => {
  const context = useContext(RouteContext);
  if (context === undefined) {
    throw new Error('useRoute must be used within a RouteProvider');
  }
  return context;
};
