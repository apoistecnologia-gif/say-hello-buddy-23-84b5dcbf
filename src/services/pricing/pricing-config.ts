import { RideCategoryKey } from "@/types/pricing";

export const PRICING_CONFIG = {
  CACHE_TTL_MS: 5 * 60 * 1000, // 5 minutes
  LABELS: {
    carros: "Carro",
    motos: "Moto",
    fretes: "Fretes e Mudanças",
    guincho: "Guincho",
    envios: "Envios",
  } as Record<RideCategoryKey, string>,
  CURRENCY_FORMAT: new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }),
};
