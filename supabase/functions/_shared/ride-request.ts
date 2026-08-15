export type RideCategoryCode = "carros" | "motos" | "fretes" | "guincho" | "envios";

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

export function normalizeRideCategory(value: unknown): RideCategoryCode | null {
  const normalized = cleanText(value, 30).toLowerCase();
  const aliases: Record<string, RideCategoryCode> = {
    carro: "carros",
    car: "carros",
    carros: "carros",
    moto: "motos",
    motos: "motos",
    frete: "fretes",
    fretes: "fretes",
    moving: "fretes",
    guincho: "guincho",
    tow: "guincho",
    envio: "envios",
    envios: "envios",
  };
  return aliases[normalized] ?? null;
}
