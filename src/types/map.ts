import { AppLocation } from './location';

export type MapErrorCode =
  | 'maps_configuration_missing'
  | 'maps_initialization_failed'
  | 'maps_element_unavailable'
  | 'maps_location_unavailable'
  | 'maps_permission_required'
  | 'maps_plugin_unavailable'
  | 'maps_key_rejected'
  | 'maps_unknown_error';

export interface MapError {
  code: MapErrorCode;
  message: string;
}

export type MapState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'location_unavailable'
  | 'permission_required'
  | 'configuration_missing'
  | 'failed';

export interface MapCoordinates {
  lat: number;
  lng: number;
}

export interface MapCameraPosition {
  coordinate: MapCoordinates;
  zoom: number;
  bearing?: number;
  pitch?: number;
}

export interface MapMarker {
  id: string;
  coordinate: MapCoordinates;
  title?: string;
  snippet?: string;
  iconUrl?: string;
  opacity?: number;
  flat?: boolean;
}

export interface MapBounds {
  northeast: MapCoordinates;
  southwest: MapCoordinates;
}

export const MAP_MESSAGES_PT: Record<MapErrorCode, string> = {
  maps_configuration_missing: 'O mapa ainda não está configurado neste ambiente.',
  maps_initialization_failed: 'Não conseguimos carregar o mapa. Tente novamente.',
  maps_element_unavailable: 'Elemento visual do mapa não encontrado.',
  maps_location_unavailable: 'Não foi possível localizar você no mapa agora.',
  maps_permission_required: 'Permissão de localização é necessária para exibir o mapa.',
  maps_plugin_unavailable: 'Plugin de mapas não disponível.',
  maps_key_rejected: 'Chave do Google Maps inválida ou rejeitada.',
  maps_unknown_error: 'Ocorreu um erro inesperado ao carregar o mapa.',
};
