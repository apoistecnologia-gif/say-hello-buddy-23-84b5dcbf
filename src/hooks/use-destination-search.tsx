import { useCallback, useEffect, useRef, useState } from "react";
import type { PlaceSuggestion, PlacesError, PlacesSearchStatus } from "../types/places";
import { placesService } from "../services/places/places-service";
import { useLocation } from "./use-location";

const isPlacesError = (value: unknown): value is PlacesError => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record["code"] === "string" && typeof record["message"] === "string";
};

export function useDestinationSearch() {
  const { currentPosition } = useLocation();
  const [query, setQueryState] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [status, setStatus] = useState<PlacesSearchStatus>("idle");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<PlacesError | null>(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState<PlaceSuggestion | null>(null);
  const debounceTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const requestSequence = useRef(0);

  const cancelDebounce = useCallback(() => {
    if (debounceTimer.current !== null) {
      window.clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
  }, []);

  const clearQuery = useCallback(() => {
    requestSequence.current += 1;
    cancelDebounce();
    setQueryState("");
    setSuggestions([]);
    setStatus("idle");
    setError(null);
    setSelectedSuggestion(null);
    placesService.cancelPendingSearch();
  }, [cancelDebounce]);

  const search = useCallback(
    async (text: string) => {
      const normalizedText = text.trim();
      if (normalizedText.length < 2) {
        setSuggestions([]);
        setStatus("below_minimum");
        setError(null);
        return;
      }

      const requestId = ++requestSequence.current;
      setIsLoading(true);
      setStatus("loading");
      setError(null);

      try {
        const results = await placesService.searchPredictions(
          normalizedText,
          currentPosition
            ? { lat: currentPosition.latitude, lng: currentPosition.longitude }
            : undefined,
        );

        if (requestId !== requestSequence.current) return;
        setSuggestions(results);
        setStatus(results.length > 0 ? "success" : "empty");
      } catch (caughtError: unknown) {
        if (requestId !== requestSequence.current) return;

        const placesError: PlacesError = isPlacesError(caughtError)
          ? caughtError
          : {
              code: "places_unknown_error",
              message: "Ocorreu um erro inesperado na busca.",
            };

        if (placesError.code === "places_cancelled") return;

        setSuggestions([]);
        setError(placesError);
        setStatus(
          placesError.code === "places_rate_limited"
            ? "rate_limited"
            : placesError.code === "places_configuration_missing"
              ? "configuration_missing"
              : placesError.code === "places_network_error"
                ? "network_error"
                : "failed",
        );
      } finally {
        if (requestId === requestSequence.current) setIsLoading(false);
      }
    },
    [currentPosition],
  );

  const setQuery = useCallback(
    (text: string) => {
      const cleanText = text.replace(/^\s+/, "");
      setQueryState(cleanText);
      setSelectedSuggestion(null);
      cancelDebounce();

      if (cleanText.length === 0) {
        clearQuery();
        return;
      }

      placesService.cancelPendingSearch();
      requestSequence.current += 1;
      setSuggestions([]);
      setError(null);

      if (cleanText.trim().length < 2) {
        setStatus("below_minimum");
        setIsLoading(false);
        return;
      }

      setStatus("debouncing");
      debounceTimer.current = window.setTimeout(() => {
        debounceTimer.current = null;
        void search(cleanText);
      }, 300);
    },
    [cancelDebounce, clearQuery, search],
  );

  const retry = useCallback(() => {
    cancelDebounce();
    if (query.trim().length >= 2) void search(query);
  }, [cancelDebounce, query, search]);

  const reset = useCallback(() => {
    clearQuery();
    placesService.resetSessionToken();
  }, [clearQuery]);

  useEffect(() => {
    return () => {
      requestSequence.current += 1;
      cancelDebounce();
      placesService.cancelPendingSearch();
    };
  }, [cancelDebounce]);

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
    setSelectedSuggestion,
  };
}
