import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { 
  LocationState, 
  AppLocation, 
  LocationError, 
  LocationPermissionStatus 
} from '@/types/location';
import { LocationService } from '@/services/location/location-service';

interface LocationContextType extends LocationState {
  requestPermission: () => Promise<boolean>;
  refreshPosition: () => Promise<void>;
  startWatching: () => Promise<void>;
  stopWatching: () => Promise<void>;
  clearError: () => void;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<LocationState>({
    permissionStatus: 'unknown',
    currentPosition: null,
    lastValidPosition: null,
    accuracyQuality: 'none',
    isLoading: false,
    isWatching: false,
    error: null,
    lastUpdatedAt: null,
  });

  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    checkInitialPermission();
    return () => {
      isMounted.current = false;
      LocationService.stopWatching();
    };
  }, []);

  const checkInitialPermission = async () => {
    const status = await LocationService.getPermissionStatus();
    if (isMounted.current) {
      setState(prev => ({ ...prev, permissionStatus: status }));
    }
  };

  const updatePosition = useCallback((pos: AppLocation) => {
    if (!isMounted.current) return;

    // Validação básica de coordenadas
    if (isNaN(pos.latitude) || isNaN(pos.longitude) || 
        pos.latitude < -90 || pos.latitude > 90 || 
        pos.longitude < -180 || pos.longitude > 180) {
      return;
    }

    setState(prev => ({
      ...prev,
      currentPosition: pos,
      lastValidPosition: pos,
      accuracyQuality: LocationService.getAccuracyQuality(pos.accuracy),
      lastUpdatedAt: Date.now(),
      error: null
    }));
  }, []);

  const handleError = useCallback((err: any) => {
    if (!isMounted.current) return;
    
    let locationError: LocationError;
    
    if (err.code === 'permission_denied' || err.message?.includes('denied')) {
      locationError = { 
        code: 'permission_denied', 
        message: 'Não foi possível acessar sua localização. Você pode informar sua origem manualmente depois.' 
      };
    } else if (err.code === 'timeout') {
      locationError = { 
        code: 'timeout', 
        message: 'Não conseguimos obter sua localização agora. Tente novamente.' 
      };
    } else {
      locationError = { 
        code: 'unknown', 
        message: 'Erro ao obter localização. Verifique se o GPS está ativo.' 
      };
    }

    setState(prev => ({
      ...prev,
      error: locationError,
      isLoading: false
    }));
  }, []);

  const requestPermission = async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    const status = await LocationService.requestPermission();
    
    if (isMounted.current) {
      setState(prev => ({ ...prev, permissionStatus: status, isLoading: false }));
    }
    
    return status === 'granted';
  };

  const refreshPosition = async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const pos = await LocationService.getCurrentPosition();
      updatePosition(pos);
    } catch (err) {
      handleError(err);
    } finally {
      if (isMounted.current) {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    }
  };

  const startWatching = async () => {
    if (state.isWatching) return;
    
    setState(prev => ({ ...prev, isWatching: true }));
    try {
      await LocationService.startWatching(updatePosition, handleError);
    } catch (err) {
      handleError(err);
      if (isMounted.current) {
        setState(prev => ({ ...prev, isWatching: false }));
      }
    }
  };

  const stopWatching = async () => {
    await LocationService.stopWatching();
    if (isMounted.current) {
      setState(prev => ({ ...prev, isWatching: false }));
    }
  };

  const clearError = () => {
    setState(prev => ({ ...prev, error: null }));
  };

  return (
    <LocationContext.Provider 
      value={{ 
        ...state, 
        requestPermission, 
        refreshPosition, 
        startWatching, 
        stopWatching, 
        clearError 
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};

export const useLocation = () => {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
};
