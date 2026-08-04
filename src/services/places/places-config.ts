/**
 * Configurações para Google Places
 */

export const PLACES_CONFIG = {
  MIN_CHARS: 3,
  DEBOUNCE_MS: 500,
  TIMEOUT_MS: 15000,
  CACHE_TTL_MS: 300000, // 5 minutos
  CACHE_MAX_SIZE: 50,
  COUNTRY_RESTRICTION: "br",
  // Campos essenciais solicitados no Place Details (fetchFields)
  // id: ID único do local
  // displayName: Nome legível do local
  // formattedAddress: Endereço completo formatado
  // location: Coordenadas geográficas (lat/lng)
  // addressComponents: Partes detalhadas do endereço (rua, número, etc)
  // types: Tipos do local (airport, establishment, etc)
  DETAILS_FIELDS: [
    "id",
    "displayName",
    "formattedAddress",
    "location",
    "addressComponents",
    "types",
  ],
};
