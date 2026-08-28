import type { RideCategoryCode } from "@/types/pricing";

const labels: Record<RideCategoryCode, string> = {
  carros: "Carro",
  motos: "Moto",
  fretes: "Fretes e Mudanças",
  guincho: "Guincho",
  envios: "Envios",
};

export const PRICING_CONFIG = {
  CACHE_TTL_MS: 5 * 60 * 1000,
  LABELS: labels,
  CURRENCY_FORMAT: new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }),
} as const;
