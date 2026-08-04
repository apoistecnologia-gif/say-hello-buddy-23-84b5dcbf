import { apiClient } from '../api/api-client';
import { 
  GeocodeCoordinates, 
  PickupAddress, 
  GeocodeError, 
  GeocodeErrorCode,
  GEOCODE_MESSAGES_PT,
  AddressPrecision,
  AddressConfidence
} from '../../types/geocoding';

interface GeocodeCacheEntry {
  address: PickupAddress;
  timestamp: number;
}

class GeocodingService {
  private static instance: GeocodingService;
  private cache: Map<string, GeocodeCacheEntry> = new Map();
  private CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private MAX_CACHE_SIZE = 50;
  private pendingRequests: Map<string, AbortController> = new Map();

  private constructor() {}

  public static getInstance(): GeocodingService {
    if (!GeocodingService.instance) {
      GeocodingService.instance = new GeocodingService();
    }
    return GeocodingService.instance;
  }

  private getCacheKey(lat: number, lng: number): string {
    // 0.0001 is roughly 11 meters at the equator
    const precision = 4;
    return `${lat.toFixed(precision)},${lng.toFixed(precision)}`;
  }

  public async resolvePickupAddress(coords: GeocodeCoordinates): Promise<PickupAddress> {
    const cacheKey = this.getCacheKey(coords.lat, coords.lng);
    const cached = this.cache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      return { ...cached.address, source: 'cache' };
    }

    // Cancel existing pending request for this specific position if exists
    if (this.pendingRequests.has(cacheKey)) {
      this.pendingRequests.get(cacheKey)?.abort();
    }

    const controller = new AbortController();
    this.pendingRequests.set(cacheKey, controller);

    try {
      // 1. Primary Reverse Geocoding
      const response = await apiClient.post<any>('/api/passenger/geocode/reverse', coords, {
        signal: controller.signal
      });

      if (!response || !response.ok) {
        throw new Error('geocode_empty_result');
      }

      const geo = response.geo || response;
      let pickupAddress = this.transformToPickupAddress(coords, geo);

      // 2. Conditional POI Check
      // If we don't have a street name or it looks very generic, try nearest POI
      const needsPoi = !pickupAddress.components?.rua || 
                      pickupAddress.precision === 'approximate' || 
                      pickupAddress.isApproximate;

      if (needsPoi) {
        try {
          const poiResponse = await apiClient.post<any>('/api/passenger/geocode/nearest-poi', coords, {
            signal: controller.signal,
            timeout: 5000 // Short timeout for POI
          });

          if (poiResponse && poiResponse.ok && poiResponse.nearestPoi) {
            pickupAddress = {
              ...pickupAddress,
              nearestPoi: poiResponse.nearestPoi,
              subLabel: `${poiResponse.nearestPoi}${pickupAddress.subLabel ? ` • ${pickupAddress.subLabel}` : ''}`
            };
          }
        } catch (poiErr) {
          console.warn('POI resolution failed, continuing with base address', poiErr);
        }
      }

      // Update Cache
      this.addToCache(cacheKey, pickupAddress);
      
      return pickupAddress;
    } catch (error: any) {
      if (error.message === 'geocode_cancelled') throw error;
      throw this.normalizeError(error.message);
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  private transformToPickupAddress(coords: GeocodeCoordinates, data: any): PickupAddress {
    const components = data.components || {};
    
    // Priority logic for main label
    const label = data.pickupLabel || 
                 data.pickupShortLabel || 
                 data.address || 
                 (components.rua ? `${components.rua}${components.numero ? `, ${components.numero}` : ''}` : null) ||
                 data.region ||
                 'Endereço não identificado';

    // Priority logic for subLabel
    const subLabel = data.pickupSubLabel || 
                    (components.bairro ? `${components.bairro}${components.cidade ? ` • ${components.cidade}` : ''}` : components.cidade);

    return {
      latitude: coords.lat,
      longitude: coords.lng,
      label,
      subLabel: subLabel || undefined,
      shortLabel: data.pickupShortLabel,
      precision: (data.precision as AddressPrecision) || (data.approximate ? 'approximate' : 'exact'),
      confidence: (data.confidence as AddressConfidence) || 'medium',
      isApproximate: !!data.approximate || data.precision === 'approximate',
      source: 'gps',
      timestamp: Date.now(),
      components,
      address: data.address,
      nearestPoi: data.nearestPoi,
      plusCode: data.plusCode,
      geocodedPosition: data.geocodedLat ? { lat: data.geocodedLat, lng: data.geocodedLng } : undefined
    };
  }

  private addToCache(key: string, address: PickupAddress) {
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, { address, timestamp: Date.now() });
  }

  public clearCache() {
    this.cache.clear();
    this.pendingRequests.forEach(c => c.abort());
    this.pendingRequests.clear();
  }

  public normalizeError(code: string): GeocodeError {
    const validCode = (GEOCODE_MESSAGES_PT[code as GeocodeErrorCode] ? code : 'geocode_unknown') as GeocodeErrorCode;
    return {
      code: validCode,
      message: GEOCODE_MESSAGES_PT[validCode]
    };
  }
}

export const geocodingService = GeocodingService.getInstance();
