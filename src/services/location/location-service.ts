import { Geolocation, Position, WatchPositionCallback } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { 
  AppLocation, 
  LocationErrorCode, 
  LocationPermissionStatus,
  AccuracyQuality 
} from '@/types/location';

const TIMEOUT = 15000;
const MAX_AGE = 30000;

export class LocationService {
  private static watchId: string | null = null;

  static isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  static async getPermissionStatus(): Promise<LocationPermissionStatus> {
    if (!this.isNative()) {
      if (!navigator.geolocation) return 'unavailable';
      // No navegador não temos API de status sem solicitar, simulamos via try-catch ou assumimos prompt
      return 'prompt';
    }

    try {
      const status = await Geolocation.checkPermissions();
      if (status.location === 'granted') return 'granted';
      if (status.location === 'denied') return 'denied';
      return 'prompt';
    } catch (e) {
      return 'unavailable';
    }
  }

  static async requestPermission(): Promise<LocationPermissionStatus> {
    if (!this.isNative()) return 'granted'; // Navegador solicita no getPosition

    try {
      const status = await Geolocation.requestPermissions({ permissions: ['location'] });
      if (status.location === 'granted') return 'granted';
      if (status.location === 'denied') return 'denied';
      return 'denied';
    } catch (e) {
      return 'denied';
    }
  }

  static async getCurrentPosition(): Promise<AppLocation> {
    if (this.isNative()) {
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: TIMEOUT,
        maximumAge: MAX_AGE
      });
      return this.mapNativePosition(position);
    } else {
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(this.mapBrowserPosition(pos)),
          (err) => reject(this.mapBrowserError(err)),
          { enableHighAccuracy: true, timeout: TIMEOUT, maximumAge: MAX_AGE }
        );
      });
    }
  }

  static async startWatching(callback: (pos: AppLocation) => void, errorCallback: (err: any) => void): Promise<void> {
    if (this.watchId) await this.stopWatching();

    if (this.isNative()) {
      this.watchId = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: TIMEOUT },
        (position, err) => {
          if (err) {
            errorCallback(err);
            return;
          }
          if (position) callback(this.mapNativePosition(position));
        }
      );
    } else {
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => callback(this.mapBrowserPosition(pos)),
        (err) => errorCallback(this.mapBrowserError(err)),
        { enableHighAccuracy: true, timeout: TIMEOUT }
      ).toString();
    }
  }

  static async stopWatching(): Promise<void> {
    if (!this.watchId) return;

    if (this.isNative()) {
      await Geolocation.clearWatch({ id: this.watchId });
    } else {
      navigator.geolocation.clearWatch(parseInt(this.watchId));
    }
    this.watchId = null;
  }

  static getAccuracyQuality(accuracy: number | null): AccuracyQuality {
    if (accuracy === null) return 'none';
    if (accuracy <= 20) return 'high';
    if (accuracy <= 100) return 'medium';
    return 'low';
  }

  private static mapNativePosition(pos: Position): AppLocation {
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      altitude: pos.coords.altitude,
      altitudeAccuracy: pos.coords.altitudeAccuracy,
      heading: pos.coords.heading,
      speed: pos.coords.speed,
      timestamp: pos.timestamp
    };
  }

  private static mapBrowserPosition(pos: GeolocationPosition): AppLocation {
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      altitude: pos.coords.altitude,
      altitudeAccuracy: pos.coords.altitudeAccuracy,
      heading: pos.coords.heading,
      speed: pos.coords.speed,
      timestamp: pos.timestamp
    };
  }

  private static mapBrowserError(err: GeolocationPositionError): { code: LocationErrorCode; message: string } {
    switch (err.code) {
      case err.PERMISSION_DENIED:
        return { code: 'permission_denied', message: 'Permissão negada pelo usuário.' };
      case err.POSITION_UNAVAILABLE:
        return { code: 'position_unavailable', message: 'Localização indisponível.' };
      case err.TIMEOUT:
        return { code: 'timeout', message: 'Tempo esgotado ao obter localização.' };
      default:
        return { code: 'unknown', message: 'Erro desconhecido ao obter localização.' };
    }
  }
}
