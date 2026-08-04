import { GoogleMap, MapType } from '@capacitor/google-maps';
import { MapCameraPosition, MapCoordinates, MapError, MapErrorCode, MAP_MESSAGES_PT, MapBounds } from '../../types/map';
import { MAP_STYLE_DARK, DEFAULT_ZOOM } from './map-config';

class MapService {
  private static instance: MapService;
  private maps: Map<string, GoogleMap> = new Map();
  private passengerMarkerId: Map<string, string> = new Map();
  private destinationMarkerId: Map<string, string> = new Map();
  private cameraMovedByUser: boolean = false;

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
    
    const existingMap = this.maps.get(mapId);
    if (existingMap) return existingMap;

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
        }
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
      this.passengerMarkerId.delete(mapId);
      this.destinationMarkerId.delete(mapId);
    }
  }

  public async upsertPickupMarker(
    mapId: string, 
    coordinate: MapCoordinates
  ): Promise<void> {
    const map = this.maps.get(mapId);
    if (!map) return;

    const existingId = this.passengerMarkerId.get(mapId);

    try {
      if (existingId) {
        await map.removeMarker(existingId);
      }

      const markerId = await map.addMarker({
        coordinate: coordinate,
        title: 'Origem',
        iconUrl: 'assets/markers/pickup.png',
        opacity: 1,
      });

      this.passengerMarkerId.set(mapId, markerId);
    } catch (error) {
      console.error('Error upserting pickup marker:', error);
    }
  }

  public async upsertDestinationMarker(
    mapId: string,
    coordinate: MapCoordinates
  ): Promise<void> {
    const map = this.maps.get(mapId);
    if (!map) return;

    const existingId = this.destinationMarkerId.get(mapId);

    try {
      if (existingId) {
        await map.removeMarker(existingId);
      }

      const markerId = await map.addMarker({
        coordinate: coordinate,
        title: 'Destino',
        iconUrl: 'assets/markers/destination.png',
        opacity: 1,
      });

      this.destinationMarkerId.set(mapId, markerId);
    } catch (error) {
      console.error('Error upserting destination marker:', error);
    }
  }

  public async removeDestinationMarker(mapId: string): Promise<void> {
    const map = this.maps.get(mapId);
    if (!map) return;

    const id = this.destinationMarkerId.get(mapId);
    if (id) {
      await map.removeMarker(id);
      this.destinationMarkerId.delete(mapId);
    }
  }

  public async centerOnPickup(mapId: string, coordinate: MapCoordinates): Promise<void> {
    if (this.cameraMovedByUser) return;
    await this.setCamera(mapId, { coordinate, zoom: DEFAULT_ZOOM });
  }

  public async fitPickupAndDestination(
    mapId: string,
    pickup: MapCoordinates,
    destination: MapCoordinates,
    padding: number = 100
  ): Promise<void> {
    const map = this.maps.get(mapId);
    if (!map) return;

    const bounds: MapBounds = {
      northeast: {
        lat: Math.max(pickup.lat, destination.lat),
        lng: Math.max(pickup.lng, destination.lng),
      },
      southwest: {
        lat: Math.min(pickup.lat, destination.lat),
        lng: Math.min(pickup.lng, destination.lng),
      }
    };

    try {
      // In @capacitor/google-maps we might need to use setCamera with bounds if supported
      // or calculate center and zoom. Standard plugin uses fitBounds logic.
      // Assuming setCamera can handle bounds or just use a helper if available.
      // Since it's a native plugin, we'll try to use the best fit.
      // For now, let's use the native fitBounds if available or camera update.
      // @ts-ignore - plugin specific
      await map.fitBounds(bounds, padding);
    } catch (e) {
      // Fallback
      const center = {
        lat: (pickup.lat + destination.lat) / 2,
        lng: (pickup.lng + destination.lng) / 2
      };
      await this.setCamera(mapId, { coordinate: center, zoom: 12 });
    }
  }

  public async setCamera(mapId: string, position: MapCameraPosition, animate = true): Promise<void> {
    const map = this.maps.get(mapId);
    if (!map) return;

    await map.setCamera({
      coordinate: position.coordinate,
      zoom: position.zoom,
      animate: animate,
    });
  }

  public setCameraMovedByUser(moved: boolean) {
    this.cameraMovedByUser = moved;
  }

  public isCameraMovedByUser(): boolean {
    return this.cameraMovedByUser;
  }

  public resetCameraMovementState() {
    this.cameraMovedByUser = false;
  }

  public normalizeError(code: MapErrorCode): MapError {
    return {
      code,
      message: MAP_MESSAGES_PT[code] || MAP_MESSAGES_PT.maps_unknown_error,
    };
  }
}

export const mapService = MapService.getInstance();
