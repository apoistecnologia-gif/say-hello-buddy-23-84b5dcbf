export type AddressPrecision = 'exact' | 'approximate' | 'range' | 'interpolated' | 'unknown';
export type AddressConfidence = 'high' | 'medium' | 'low' | 'none';

export interface GeocodeCoordinates {
  lat: number;
  lng: number;
}

export interface GeocodeComponents {
  rua?: string;
  numero?: string;
  povoado?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  estadoSigla?: string;
  pais?: string;
}

export interface PickupAddress {
  latitude: number;
  longitude: number;
  label: string;
  subLabel?: string;
  shortLabel?: string;
  precision: AddressPrecision;
  confidence: AddressConfidence;
  isApproximate: boolean;
  source: 'gps' | 'manual' | 'cache';
  timestamp: number;
  
  // Optional components
  components?: GeocodeComponents;
  address?: string;
  nearestPoi?: string;
  plusCode?: string;
  geocodedPosition?: GeocodeCoordinates;
}

export type GeocodeErrorCode =
  | 'geocode_configuration_missing'
  | 'geocode_authentication_required'
  | 'geocode_invalid_coordinates'
  | 'geocode_timeout'
  | 'geocode_network_error'
  | 'geocode_rate_limited'
  | 'geocode_service_unavailable'
  | 'geocode_empty_result'
  | 'geocode_invalid_response'
  | 'geocode_cancelled'
  | 'geocode_unknown';

export interface GeocodeError {
  code: GeocodeErrorCode;
  message: string;
}

export type ReverseGeocodeState =
  | 'idle'
  | 'waiting_for_location'
  | 'loading'
  | 'success'
  | 'approximate'
  | 'unavailable'
  | 'authentication_required'
  | 'network_error'
  | 'failed';

export const GEOCODE_MESSAGES_PT: Record<GeocodeErrorCode, string> = {
  geocode_configuration_missing: 'Serviço de localização não configurado.',
  geocode_authentication_required: 'Sua sessão expirou. Entre novamente.',
  geocode_invalid_coordinates: 'Coordenadas inválidas para identificação.',
  geocode_timeout: 'Está demorando para identificar seu endereço. Tente novamente.',
  geocode_network_error: 'Não foi possível identificar o endereço. Verifique sua conexão.',
  geocode_rate_limited: 'Muitas solicitações. Tente novamente em instantes.',
  geocode_service_unavailable: 'Serviço de endereços temporariamente indisponível.',
  geocode_empty_result: 'Não encontramos um endereço exato para este ponto.',
  geocode_invalid_response: 'Resposta inválida do servidor de endereços.',
  geocode_cancelled: 'Solicitação cancelada.',
  geocode_unknown: 'Erro inesperado ao identificar o endereço.',
};
