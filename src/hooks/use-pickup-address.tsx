import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from './use-auth';
import { useLocation } from './use-location';
import { geocodingService } from '../services/geocoding/geocoding-service';
import { 
  PickupAddress, 
  ReverseGeocodeState, 
  GeocodeError 
} from '../types/geocoding';

interface PickupAddressContextType {
  address: PickupAddress | null;
  status: ReverseGeocodeState;
  isLoading: boolean;
  error: GeocodeError | null;
  lastResolvedAt: number | null;
  refreshAddress: () => Promise<void>;
  clearAddress: () => void;
}

const PickupAddressContext = createContext<PickupAddressContextType | undefined>(undefined);

export const PickupAddressProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session } = useAuth();
  const { currentPosition } = useLocation();
  const [address, setAddress] = useState<PickupAddress | null>(null);
  const [status, setStatus] = useState<ReverseGeocodeState>('idle');
  const [error, setError] = useState<GeocodeError | null>(null);
  const [lastResolvedAt, setLastResolvedAt] = useState<number | null>(null);
  
  const lastCoords = useRef<{ lat: number; lng: number } | null>(null);
  const resolutionThreshold = 25; // meters

  // Haversine formula for distance check
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // metres
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

  const fetchAddress = useCallback(async (lat: number, lng: number) => {
    if (!session) {
      setStatus('authentication_required');
      return;
    }

    setStatus('loading');
    try {
      const result = await geocodingService.resolvePickupAddress({ lat, lng });
      setAddress(result);
      setStatus(result.isApproximate ? 'approximate' : 'success');
      setError(null);
      setLastResolvedAt(Date.now());
      lastCoords.current = { lat, lng };
    } catch (err: any) {
      if (err.message === 'geocode_cancelled') return;
      setStatus('failed');
      setError(geocodingService.normalizeError(err.message));
    }
  }, [session]);

  const refreshAddress = useCallback(async () => {
    if (currentPosition) {
      await fetchAddress(currentPosition.latitude, currentPosition.longitude);
    }
  }, [currentPosition, fetchAddress]);

  const clearAddress = useCallback(() => {
    setAddress(null);
    setStatus('idle');
    setError(null);
    lastCoords.current = null;
    geocodingService.clearCache();
  }, []);

  // Auto-resolve when position changes significantly
  useEffect(() => {
    if (!currentPosition || !session) return;

    const { latitude: lat, longitude: lng } = currentPosition;

    if (!lastCoords.current) {
      fetchAddress(lat, lng);
      return;
    }

    const distance = calculateDistance(
      lastCoords.current.lat, 
      lastCoords.current.lng, 
      lat, 
      lng
    );

    if (distance > resolutionThreshold) {
      fetchAddress(lat, lng);
    }
  }, [currentPosition, session, fetchAddress]);

  // Cleanup on logout
  useEffect(() => {
    if (!session) {
      clearAddress();
    }
  }, [session, clearAddress]);

  return (
    <PickupAddressContext.Provider
      value={{
        address,
        status,
        isLoading: status === 'loading',
        error,
        lastResolvedAt,
        refreshAddress,
        clearAddress
      }}
    >
      {children}
    </PickupAddressContext.Provider>
  );
};

export const usePickupAddress = () => {
  const context = useContext(PickupAddressContext);
  if (context === undefined) {
    throw new Error('usePickupAddress must be used within a PickupAddressProvider');
  }
  return context;
};
