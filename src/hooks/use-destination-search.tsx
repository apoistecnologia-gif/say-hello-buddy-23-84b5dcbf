import { useState, useCallback, useRef, useEffect } from 'react';
import { 
  PlaceSuggestion, 
  PlacesSearchStatus, 
  PlacesError, 
  PlacesErrorCode 
} from '../types/places';
import { placesService } from '../services/places/places-service';
import { PLACES_CONFIG } from '../services/places/places-config';
import { useLocation } from './use-location';

export function useDestinationSearch() {
  const { location } = useLocation();
  const [query, setQueryState] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [status, setStatus] = useState<PlacesSearchStatus>('idle');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<PlacesError | null>(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState<PlaceSuggestion | null>(null);
  
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const clearQuery = useCallback(() => {
    setQueryState('');
    setSuggestions([]);
    setStatus('idle');
    setError(null);
    placesService.cancelPendingSearch();
  }, []);

  const search = useCallback(async (text: string) => {
    if (text.length < PLACES_CONFIG.MIN_CHARS) {
      setSuggestions([]);
      setStatus('below_minimum');
      return;
    }

    setIsLoading(true);
    setStatus('loading');
    setError(null);

    try {
      const results = await placesService.searchPredictions(
        text, 
        location ? { lat: location.latitude, lng: location.longitude } : undefined
      );
      
      setSuggestions(results);
      setStatus(results.length > 0 ? 'success' : 'empty');
    } catch (err: any) {
      const placesError = err as PlacesError;
      if (placesError.code === 'places_cancelled') return;
      
      setError(placesError);
      setStatus(placesError.code === 'places_rate_limited' ? 'rate_limited' : 'failed');
    } finally {
      setIsLoading(false);
    }
  }, [location]);

  const setQuery = useCallback((text: string) => {
    const cleanText = text.replace(/^\s+/, '');
    setQueryState(cleanText);

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (cleanText.length === 0) {
      clearQuery();
      return;
    }

    if (cleanText.length < PLACES_CONFIG.MIN_CHARS) {
      setStatus('below_minimum');
      return;
    }

    setStatus('debouncing');
    debounceTimer.current = setTimeout(() => {
      search(cleanText);
    }, PLACES_CONFIG.DEBOUNCE_MS);
  }, [search, clearQuery]);

  const retry = useCallback(() => {
    if (query) search(query);
  }, [query, search]);

  const reset = useCallback(() => {
    clearQuery();
    placesService.resetSessionToken();
  }, [clearQuery]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      placesService.cancelPendingSearch();
    };
  }, []);

  return {
    query,
    suggestions,
    status,
    isLoading,
    selectedSuggestion,
    error,
    setQuery,
    clearQuery,
    retry,
    reset,
    setSelectedSuggestion
  };
}
