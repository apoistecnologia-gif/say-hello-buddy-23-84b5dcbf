export const ROUTE_CONFIG = {
  TIMEOUT_MS: 30000,
  CACHE_TTL_MS: 300000, // 5 minutes
  CACHE_MAX_ENTRIES: 10,
  RELEVANT_MOVE_THRESHOLD_METERS: 30, // 30m distance to trigger recalculation
  DEBOUNCE_MS: 1500,

  STYLE: {
    STROKE_COLOR: "#FFB800", // Yellow
    STROKE_WEIGHT: 6,
    STROKE_OPACITY: 0.8,
  },

  MAP_PADDING: {
    TOP: 100,
    RIGHT: 50,
    BOTTOM: 350, // More padding for bottom sheet
    LEFT: 50,
  },
};

export const ROUTE_ERROR_MESSAGES: Record<string, string> = {
  route_configuration_missing: "O serviço de rotas não está configurado.",
  route_authentication_required: "Sua sessão expirou. Entre novamente.",
  route_invalid_origin: "Ponto de embarque inválido.",
  route_invalid_destination: "Ponto de destino inválido.",
  route_timeout: "O cálculo da rota está demorando. Tente novamente.",
  route_network_error: "Falha de conexão com o servidor.",
  route_rate_limited: "Muitas solicitações. Aguarde um instante.",
  route_not_found: "Não encontramos uma rota disponível para esse trajeto.",
  route_service_unavailable: "O serviço de rotas está temporariamente indisponível.",
  route_key_blocked: "O serviço de rotas precisa ser configurado pelo suporte.",
  route_invalid_response: "Resposta inválida do servidor de rotas.",
  route_invalid_polyline: "Não foi possível processar a linha da rota.",
  route_cancelled: "Cálculo de rota cancelado.",
  route_unknown_error: "Não foi possível calcular a rota agora.",
};
