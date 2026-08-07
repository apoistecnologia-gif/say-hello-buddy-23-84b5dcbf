import {
  PlaceSuggestion,
  PlacesError,
  DestinationAddress,
  AddressComponent,
  PlacesErrorCode,
  PLACES_MESSAGES_PT,
} from "../../types/places";
import { PLACES_CONFIG } from "./places-config";
import { googleMapsLoader } from "../google/google-maps-loader";

class PlacesService {
  private static instance: PlacesService;
  private sessionToken: any = null;
  private cache: Map<string, { data: PlaceSuggestion[]; timestamp: number }> = new Map();
  private lastRequestId = 0;
  private initializationPromise: Promise<void> | null = null;
  private placesLib: any = null;

  private constructor() {}

  public static getInstance(): PlacesService {
    if (!PlacesService.instance) {
      PlacesService.instance = new PlacesService();
    }
    return PlacesService.instance;
  }

  public async initialize(): Promise<void> {
    if (this.placesLib) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      try {
        this.placesLib = await googleMapsLoader.importLibrary("places");
        if (!this.placesLib?.AutocompleteSuggestion) {
          throw new Error("places_autocomplete_unavailable");
        }
        this.createSessionToken();
      } catch (error) {
        console.error("Failed to initialize Places library:", error);
        this.placesLib = null;
        throw this.normalizeError("places_library_load_failed");
      } finally {
        this.initializationPromise = null;
      }
    })();

    return this.initializationPromise;
  }

  public createSessionToken(): void {
    if (this.placesLib?.AutocompleteSessionToken) {
      this.sessionToken = new this.placesLib.AutocompleteSessionToken();
    }
  }

  public resetSessionToken(): void {
    this.createSessionToken();
  }

  public async searchPredictions(
    query: string,
    locationBias?: { lat: number; lng: number },
  ): Promise<PlaceSuggestion[]> {
    const normalizedQuery = query.trim();

    if (normalizedQuery.length < PLACES_CONFIG.MIN_CHARS) {
      return [];
    }

    const cacheKey = normalizedQuery.toLowerCase();
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < PLACES_CONFIG.CACHE_TTL_MS) {
      return cached.data;
    }

    await this.initialize();
    const requestId = ++this.lastRequestId;

    try {
      const request: any = {
        input: normalizedQuery,
        sessionToken: this.sessionToken,
        language: "pt-BR",
        region: "br",
        includedRegionCodes: ["br"],
      };

      if (locationBias) {
        request.locationBias = {
          center: { lat: locationBias.lat, lng: locationBias.lng },
          radius: 10000,
        };
        request.origin = { lat: locationBias.lat, lng: locationBias.lng };
      }

      const { suggestions: googleSuggestions } =
        await this.placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);

      if (requestId !== this.lastRequestId) {
        throw this.normalizeError("places_cancelled");
      }

      const suggestions = (googleSuggestions ?? [])
        .map((suggestion: any) => this.normalizeSuggestion(suggestion))
        .filter((suggestion: PlaceSuggestion | null): suggestion is PlaceSuggestion => Boolean(suggestion));

      if (this.cache.size >= PLACES_CONFIG.CACHE_MAX_SIZE) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey) this.cache.delete(firstKey);
      }
      this.cache.set(cacheKey, { data: suggestions, timestamp: Date.now() });

      return suggestions;
    } catch (error: any) {
      if (error?.code === "places_cancelled") throw error;

      console.error("Places Search Error:", error);

      const message = String(error?.message ?? error ?? "").toLowerCase();
      if (
        message.includes("api key") ||
        message.includes("not authorized") ||
        message.includes("permission") ||
        message.includes("billing") ||
        message.includes("places api")
      ) {
        throw this.normalizeError("places_configuration_missing");
      }
      if (message.includes("quota") || message.includes("rate")) {
        throw this.normalizeError("places_rate_limited");
      }

      throw this.normalizeError("places_network_error");
    }
  }

  public async selectPrediction(prediction: PlaceSuggestion): Promise<DestinationAddress> {
    await this.initialize();

    try {
      const place = (prediction as PlaceSuggestion & { place?: any }).place;

      if (!place) {
        throw this.normalizeError("places_invalid_prediction");
      }

      await place.fetchFields({
        fields: PLACES_CONFIG.DETAILS_FIELDS,
      });

      const normalized = this.normalizePlace(place);
      this.resetSessionToken();
      return normalized;
    } catch (error: any) {
      console.error("Place Details Error:", error);
      if (error?.code && String(error.code).startsWith("places_")) throw error;
      throw this.normalizeError("places_details_unavailable");
    }
  }

  public cancelPendingSearch(): void {
    this.lastRequestId++;
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public dispose(): void {
    this.clearCache();
    this.sessionToken = null;
    this.placesLib = null;
    this.initializationPromise = null;
  }

  private normalizeSuggestion(suggestion: any): PlaceSuggestion | null {
    const prediction = suggestion?.placePrediction;
    if (!prediction?.placeId) return null;

    const primaryText =
      prediction.mainText?.text ||
      prediction.text?.text ||
      String(prediction.text ?? "");
    const secondaryText = prediction.secondaryText?.text || undefined;
    const fullText = prediction.text?.text || [primaryText, secondaryText].filter(Boolean).join(", ");

    if (!primaryText) return null;

    return {
      placeId: prediction.placeId,
      primaryText,
      secondaryText,
      fullText,
      types: prediction.types || [],
      distanceMeters: prediction.distanceMeters,
      place: prediction.toPlace(),
    } as PlaceSuggestion;
  }

  private normalizePlace(place: any): DestinationAddress {
    const components: AddressComponent = {};

    place.addressComponents?.forEach((component: any) => {
      const types = component.types ?? [];
      if (types.includes("route")) components.rua = component.longText;
      if (types.includes("street_number")) components.numero = component.longText;
      if (types.includes("neighborhood") || types.includes("sublocality")) {
        components.bairro = component.longText;
      }
      if (types.includes("locality")) components.cidade = component.longText;
      if (types.includes("administrative_area_level_1")) {
        components.estado = component.longText;
        components.estadoSigla = component.shortText;
      }
      if (types.includes("postal_code")) components.cep = component.longText;
      if (types.includes("country")) components.pais = component.longText;
    });

    const location = place.location;
    const latitude =
      typeof location?.lat === "function" ? location.lat() : Number(location?.lat);
    const longitude =
      typeof location?.lng === "function" ? location.lng() : Number(location?.lng);

    if (!place.id || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw this.normalizeError("places_invalid_location");
    }

    const formattedAddress = String(place.formattedAddress ?? "").trim();
    const displayName =
      typeof place.displayName === "string"
        ? place.displayName
        : String(place.displayName?.text ?? "").trim();

    return {
      placeId: place.id,
      latitude,
      longitude,
      label: displayName || formattedAddress.split(",")[0] || "Local selecionado",
      subLabel: formattedAddress || undefined,
      formattedAddress: formattedAddress || displayName,
      name: displayName || undefined,
      components,
      types: place.types || [],
      selectedAt: new Date().toISOString(),
      source: "google_places",
    };
  }

  private normalizeError(code: PlacesErrorCode): PlacesError {
    return {
      code,
      message: PLACES_MESSAGES_PT[code],
    };
  }
}

export const placesService = PlacesService.getInstance();
