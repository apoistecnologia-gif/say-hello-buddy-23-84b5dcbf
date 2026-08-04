import { GoogleMap, MapType, Marker } from '@capacitor/google-maps';
import { MapCameraPosition, MapCoordinates, MapError, MapErrorCode, MAP_MESSAGES_PT } from '../../types/map';
import { MAP_STYLE_DARK, DEFAULT_ZOOM } from './map-config';

class MapService {
  private static instance: MapService;
  private maps: Map<string, GoogleMap> = new Map();
  private markers: Map<string, string> = new Map(); // mapId -> markerId

  private constructor() {}

  public static getInstance(): MapService {
    if (!MapService.instance) {
      MapService.instance = new MapService();
    }
    return MapService.instance;
  }

  public async createMap(
    element: HTMLElement,
    apiKey: string,
    initialPosition?: MapCoordinates
  ): Promise<GoogleMap> {
    const mapId = element.id || 'default-map';
    
    if (this.maps.has(mapId)) {
      return this.maps.get(mapId)!;
    }

    try {
      const map = await GoogleMap.create({
        id: mapId,
        element: element,
        apiKey: apiKey,
        config: {
          center: initialPosition || { lat: -15.793889, lng: -47.882778 },
          zoom: DEFAULT_ZOOM,
          mapTypeId: MapType.Normal,
          styles: MAP_STYLE_DARK,
        },
        forceCreate: true
      });

      this.maps.set(mapId, map);
      return map;
    } catch (error) {
      console.error('Failed to create map:', error);
      throw this.normalizeError('maps_initialization_failed');
    }
  }

  public async destroyMap(mapId: string): Promise<void> {
    const map = this.maps.get(mapId);
    if (map) {
      await map.destroy();
      this.maps.delete(mapId);
      this.markers.delete(mapId);
    }
  }

  public async updatePassengerMarker(
    mapId: string, 
    coordinate: MapCoordinates,
    accuracy?: number | null
  ): Promise<void> {
    const map = this.maps.get(mapId);
    if (!map) return;

    const existingMarkerId = this.markers.get(mapId);

    try {
      if (existingMarkerId) {
        // Unfortunately @capacitor/google-maps doesn't have a simple update position yet in v6/v8
        // We often have to remove and re-add or use a specific implementation.
        // For v8 official, we'll try to remove and add if update isn't clean.
        await map.removeMarker(existingMarkerId);
      }

      const markerId = await map.addMarker({
        coordinate: coordinate,
        title: 'Sua Posição',
        iconUrl: 'assets/markers/passenger.png', // Fallback handled by plugin if missing
        opacity: 1,
      });

      this.markers.set(mapId, markerId);
    } catch (error) {
      console.error('Error updating marker:', error);
    }
  }

  public async setCamera(mapId: string, position: MapCameraPosition, animate = true): Promise<void> {
    const map = this.maps.get(mapId);
    if (!map) return;

    if (animate) {
      await map.setCamera({
        coordinate: position.coordinate,
        zoom: position.zoom,
        animate: true,
      });
    } else {
      await map.setCamera({
        coordinate: position.coordinate,
        zoom: position.zoom,
      });
    }
  }

  public normalizeError(code: MapErrorCode): MapError {
    return {
      code,
      message: MAP_MESSAGES_PT[code] || MAP_MESSAGES_PT.maps_unknown_error,
    };
  }
}

export const mapService = MapService.getInstance();
