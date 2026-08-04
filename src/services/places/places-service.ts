import { 
  PlaceSuggestion, 
  PlacesError, 
  DestinationAddress, 
  AddressComponent,
  PlacesErrorCode,
  PLACES_MESSAGES_PT
} from '../../types/places';
import { PLACES_CONFIG } from './places-config';

class PlacesService {
  private static instance: PlacesService;
  private sessionToken: string | null = null;
  private cache: Map<string, { data: PlaceSuggestion[]; timestamp: number }> = new Map();
  private abortController: AbortController | null = null;
  private lastQuery: string = '';

  private constructor() {}

  public static getInstance(): PlacesService {
    if (!PlacesService.instance) {
      PlacesService.instance = new PlacesService();
    }
    return PlacesService.instance;
  }

  public createSessionToken(): string {
    this.sessionToken = crypto.randomUUID();
    return this.sessionToken;
  }

  public resetSessionToken(): void {
    this.sessionToken = null;
  }

  public getSessionToken(): string {
    if (!this.sessionToken) {
      return this.createSessionToken();
    }
    return this.sessionToken;
  }

  public async searchPredictions(
    query: string, 
    locationBias?: { lat: number; lng: number }
  ): Promise<PlaceSuggestion[]> {
    const normalizedQuery = query.trim().toLowerCase();
    
    if (normalizedQuery.length < PLACES_CONFIG.MIN_CHARS) {
      return [];
    }

    // Check cache
    const cached = this.cache.get(normalizedQuery);
    if (cached && Date.now() - cached.timestamp < PLACES_CONFIG.CACHE_TTL_MS) {
      return cached.data;
    }

    // Cancel previous request
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    this.lastQuery = normalizedQuery;

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      throw this.normalizeError('places_configuration_missing');
    }

    try {
      // For WEB environment in sandbox, we use the Fetch API to Google Places Autocomplete (CORS might be an issue depending on restrictions)
      // On Capacitor Android, this would typically go through a native wrapper or specialized proxy if CORS is blocked.
      // Guidelines state: "No proxy publico", "No desabilitar CORS".
      // Usually @capacitor/google-maps doesn't have a standalone Places SDK yet in v8, 
      // so we use the Google Maps JS SDK which is already loaded by the map component or direct REST if configured.
      
      // Since we already have @capacitor/google-maps, we assume the API key is valid.
      // We will implement the logic using the standard AutocompleteService if available, 
      // or a REST call with the session token.
      
      const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
      url.searchParams.append('input', query);
      url.searchParams.append('key', apiKey);
      url.searchParams.append('sessiontoken', this.getSessionToken());
      url.searchParams.append('components', `country:${PLACES_CONFIG.COUNTRY_RESTRICTION}`);
      url.searchParams.append('language', 'pt-BR');
      
      if (locationBias) {
        url.searchParams.append('location', `${locationBias.lat},${locationBias.lng}`);
        url.searchParams.append('radius', '50000'); // 50km bias
      }

      const response = await fetch(url.toString(), { 
        signal: this.abortController.signal 
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();

      if (data.status === 'ZERO_RESULTS') {
        return [];
      }

      if (data.status === 'OVER_QUERY_LIMIT') {
        throw this.normalizeError('places_rate_limited');
      }

      if (data.status !== 'OK') {
        throw this.normalizeError('places_invalid_response');
      }

      const suggestions = data.predictions.map((p: any) => this.normalizePrediction(p));
      
      // Update cache
      if (this.cache.size >= PLACES_CONFIG.CACHE_MAX_SIZE) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey) this.cache.delete(firstKey);
      }
      this.cache.set(normalizedQuery, { data: suggestions, timestamp: Date.now() });

      return suggestions;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw this.normalizeError('places_cancelled');
      }
      console.error('Places Search Error:', error);
      throw this.normalizeError('places_network_error');
    }
  }

  public async getPlaceDetails(placeId: string): Promise<DestinationAddress> {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      throw this.normalizeError('places_configuration_missing');
    }

    try {
      const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
      url.searchParams.append('place_id', placeId);
      url.searchParams.append('key', apiKey);
      url.searchParams.append('sessiontoken', this.getSessionToken());
      url.searchParams.append('fields', PLACES_CONFIG.DETAILS_FIELDS.join(','));
      url.searchParams.append('language', 'pt-BR');

      const response = await fetch(url.toString());
      if (!response.ok) throw new Error('Network response not ok');

      const data = await response.json();
      if (data.status !== 'OK' || !data.result) {
        throw this.normalizeError('places_details_unavailable');
      }

      return this.normalizePlaceDetails(data.result);
    } catch (error: any) {
      console.error('Place Details Error:', error);
      throw this.normalizeError('places_details_unavailable');
    }
  }

  public cancelPendingSearch(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  public clearCache(): void {
    this.cache.clear();
  }

  private normalizePrediction(p: any): PlaceSuggestion {
    return {
      placeId: p.place_id,
      primaryText: p.structured_formatting.main_text,
      secondaryText: p.structured_formatting.secondary_text,
      fullText: p.description,
      types: p.types || [],
      distanceMeters: p.distance_meters,
      matchedSubstrings: p.matched_substrings
    };
  }

  private normalizePlaceDetails(r: any): DestinationAddress {
    const components: AddressComponent = {};
    
    r.address_components?.forEach((c: any) => {
      const type = c.types[0];
      if (type === 'route') components.rua = c.long_name;
      if (type === 'street_number') components.numero = c.long_name;
      if (type === 'neighborhood' || type === 'sublocality') components.bairro = c.long_name;
      if (type === 'locality') components.cidade = c.long_name;
      if (type === 'administrative_area_level_1') {
        components.estado = c.long_name;
        components.estadoSigla = c.short_name;
      }
      if (type === 'postal_code') components.cep = c.long_name;
      if (type === 'country') components.pais = c.long_name;
    });

    return {
      placeId: r.place_id,
      latitude: r.geometry.location.lat,
      longitude: r.geometry.location.lng,
      label: r.name || r.formatted_address.split(',')[0],
      subLabel: r.formatted_address,
      formattedAddress: r.formatted_address,
      name: r.name,
      components,
      types: r.types || [],
      selectedAt: new Date().toISOString(),
      source: 'google_places'
    };
  }

  private normalizeError(code: PlacesErrorCode): PlacesError {
    return {
      code,
      message: PLACES_MESSAGES_PT[code]
    };
  }
}

export const placesService = PlacesService.getInstance();
