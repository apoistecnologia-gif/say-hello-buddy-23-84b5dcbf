/**
 * Configurações para Google Places
 */

export const PLACES_CONFIG = {
  MIN_CHARS: 3,
  DEBOUNCE_MS: 500,
  TIMEOUT_MS: 15000,
  CACHE_TTL_MS: 300000, // 5 minutos
  CACHE_MAX_SIZE: 50,
  COUNTRY_RESTRICTION: 'br',
  // Campos solicitados no Place Details
  DETAILS_FIELDS: [
    'place_id',
    'name',
    'formatted_address',
    'geometry',
    'address_components',
    'types'
  ]
};
