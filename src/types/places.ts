/**
 * Tipagem estrita para integração com Google Places
 * Seguindo as diretrizes da STO-007A
 */

export type PlacesErrorCode = 
  | 'places_configuration_missing'
  | 'places_invalid_query'
  | 'places_timeout'
  | 'places_network_error'
  | 'places_rate_limited'
  | 'places_zero_results'
  | 'places_invalid_response'
  | 'places_invalid_place_id'
  | 'places_details_unavailable'
  | 'places_library_load_failed'
  | 'places_invalid_prediction'
  | 'places_invalid_location'
  | 'places_cancelled'
  | 'places_unknown_error';

export interface PlacesError {
  code: PlacesErrorCode;
  message: string;
}

export const PLACES_MESSAGES_PT: Record<PlacesErrorCode, string> = {
  places_configuration_missing: 'A busca de endereços ainda não está configurada neste ambiente.',
  places_invalid_query: 'Consulta de busca inválida.',
  places_timeout: 'A busca está demorando mais que o normal. Tente novamente.',
  places_network_error: 'Não foi possível buscar endereços. Verifique sua conexão.',
  places_rate_limited: 'Muitas solicitações em pouco tempo. Tente novamente em alguns instantes.',
  places_zero_results: 'Não encontramos resultados para essa busca.',
  places_invalid_response: 'Resposta inválida do serviço de busca.',
  places_invalid_place_id: 'ID do local inválido.',
  places_details_unavailable: 'Não foi possível abrir este local. Escolha outra opção.',
  places_cancelled: 'Busca cancelada.',
  places_unknown_error: 'Ocorreu um erro inesperado na busca.',
  places_library_load_failed: 'Falha ao carregar a biblioteca de mapas.',
  places_invalid_prediction: 'Sugestão de local inválida.',
  places_invalid_location: 'Localização do destino inválida.'
};

export type PlaceSuggestionType = 
  | 'address'
  | 'establishment'
  | 'geocode'
  | 'airport'
  | 'bus_station'
  | 'train_station'
  | 'shopping_mall'
  | 'university'
  | 'hospital';

export interface PlaceSuggestion {
  placeId: string;
  primaryText: string;
  secondaryText?: string;
  fullText: string;
  types: string[];
  distanceMeters?: number;
  matchedSubstrings?: Array<{ length: number; offset: number }>;
}

export interface AddressComponent {
  rua?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  estadoSigla?: string;
  cep?: string;
  pais?: string;
}

export interface DestinationAddress {
  placeId: string;
  latitude: number;
  longitude: number;
  label: string;
  subLabel?: string;
  formattedAddress: string;
  name: string;
  components: AddressComponent;
  types: string[];
  selectedAt: string;
  source: 'google_places';
}

export type PlacesSearchStatus = 
  | 'idle'
  | 'typing'
  | 'below_minimum'
  | 'debouncing'
  | 'loading'
  | 'success'
  | 'empty'
  | 'selecting'
  | 'selected'
  | 'network_error'
  | 'rate_limited'
  | 'configuration_missing'
  | 'failed';

export interface PlacesSessionState {
  sessionToken?: string;
  expiresAt?: number;
}
