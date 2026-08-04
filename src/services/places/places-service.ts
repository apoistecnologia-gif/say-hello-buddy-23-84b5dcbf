import { 
  PlaceSuggestion, 
  PlacesError, 
  DestinationAddress, 
  AddressComponent,
  PlacesErrorCode,
  PLACES_MESSAGES_PT
} from '../../types/places';
import { PLACES_CONFIG } from './places-config';
import { googleMapsLoader } from '../google/google-maps-loader';

class PlacesService {
  private static instance: PlacesService;
  private sessionToken: any = null; // google.maps.places.AutocompleteSessionToken
  private cache: Map<string, { data: PlaceSuggestion[]; timestamp: number }> = new Map();
  private lastRequestId: number = 0;
  private isInitializing: boolean = false;
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
    if (this.isInitializing) return;

    this.isInitializing = true;
    try {
      this.placesLib = await googleMapsLoader.importLibrary('places');
      this.createSessionToken();
    } catch (error) {
      console.error('Failed to initialize Places library:', error);
      throw this.normalizeError('places_library_load_failed');
    } finally {
      this.isInitializing = false;
    }
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
    locationBias?: { lat: number; lng: number }
  ): Promise<PlaceSuggestion[]> {
    const normalizedQuery = query.trim();
    
    if (normalizedQuery.length < PLACES_CONFIG.MIN_CHARS) {
      return [];
    }

    // Check cache
    const cacheKey = `${normalizedQuery.toLowerCase()}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < PLACES_CONFIG.CACHE_TTL_MS) {
      return cached.data;
    }

    await this.initialize();

    const requestId = ++this.lastRequestId;

    try {
      // Configuração moderna da API Places
      const request: any = {
        input: normalizedQuery,
        sessionToken: this.sessionToken,
        language: "pt-BR",
        region: "BR",
        includedRegionCodes: ["br"],
      };

      if (locationBias) {
        // Bias circular de 10km (raio urbano centralizado)
        request.locationBias = {
          center: { lat: locationBias.lat, lng: locationBias.lng },
          radius: 10000 
        };
      }

      // Utilizando fetchAutocompleteSuggestions da API moderna
      // @ts-ignore
      const { suggestions: googleSuggestions } = await this.placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);

      // Proteção contra respostas fora de ordem
      if (requestId !== this.lastRequestId) {
        throw this.normalizeError('places_cancelled');
      }

      const suggestions = googleSuggestions.map((s: any) => this.normalizeSuggestion(s));
      
      // Update cache
      if (this.cache.size >= PLACES_CONFIG.CACHE_MAX_SIZE) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey) this.cache.delete(firstKey);
      }
      this.cache.set(cacheKey, { data: suggestions, timestamp: Date.now() });

      return suggestions;
    } catch (error: any) {
      if (error.code === 'places_cancelled') throw error;
      
      console.error('Places Search Error:', error);
      
      // Tratar estados de erro específicos da biblioteca se necessário
      throw this.normalizeError('places_network_error');
    }
  }

  public async selectPrediction(prediction: any): Promise<DestinationAddress> {
    await this.initialize();

    try {
      // Obter o objeto Place oficial a partir da previsão (API Moderna)
      // O prediction.place aqui é a referência segura ao objeto de previsão necessária para seleção
      const place = prediction.place;
      
      if (!place) {
        throw this.normalizeError('places_invalid_prediction');
      }

      // Solicitar somente os campos necessários (fetchFields)
      await place.fetchFields({
        fields: PLACES_CONFIG.DETAILS_FIELDS
      });

      const normalized = this.normalizePlace(place);
      
      // Encerrar sessão atual
      this.resetSessionToken();
      
      return normalized;
    } catch (error: any) {
      console.error('Place Details Error:', error);
      throw this.normalizeError('places_details_unavailable');
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
  }

  private normalizeSuggestion(s: any): PlaceSuggestion {
    // A estrutura moderna de AutocompleteSuggestion tem propriedades aninhadas
    const p = s.placePrediction;
    return {
      placeId: p.placeId,
      primaryText: p.text.mainText.text,
      secondaryText: p.text.secondaryText?.text,
      fullText: p.text.text,
      types: p.types || [],
      distanceMeters: p.distanceMeters,
      // Guardamos a referência ao objeto de lugar para o fetchFields posterior
      // @ts-ignore
      place: p.toPlace() 
    };
  }

  private normalizePlace(place: any): DestinationAddress {
    const components: AddressComponent = {};
    
    // Mapeamento moderno de addressComponents
    place.addressComponents?.forEach((c: any) => {
      const types = c.types;
      if (types.includes('route')) components.rua = c.longText;
      if (types.includes('street_number')) components.numero = c.longText;
      if (types.includes('neighborhood') || types.includes('sublocality')) components.bairro = c.longText;
      if (types.includes('locality')) components.cidade = c.longText;
      if (types.includes('administrative_area_level_1')) {
        components.estado = c.longText;
        components.estadoSigla = c.shortText;
      }
      if (types.includes('postal_code')) components.cep = c.longText;
      if (types.includes('country')) components.pais = c.longText;
    });

    const location = place.location;
    if (!location || typeof location.lat !== 'function' || typeof location.lng !== 'function') {
      throw this.normalizeError('places_invalid_location');
    }

    const latitude = location.lat();
    const longitude = location.lng();

    if (!place.id || isNaN(latitude) || isNaN(longitude)) {
      throw this.normalizeError('places_invalid_location');
    }

    return {
      placeId: place.id,
      latitude,
      longitude,
      label: place.displayName || place.formattedAddress?.split(',')[0] || 'Local selecionado',
      subLabel: place.formattedAddress,
      formattedAddress: place.formattedAddress,
      name: place.displayName,
      components,
      types: place.types || [],
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
