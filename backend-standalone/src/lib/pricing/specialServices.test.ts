import { describe, expect, it } from "vitest";
import { calculateServerFare } from "./specialServices";

describe("calculateServerFare", () => {
  it("aplica adicionais de frete informados pelo passageiro", () => {
    const result = calculateServerFare({
      category: "fretes",
      distanceKm: 10,
      durationMin: 20,
      tariff: {
        base_fare: 10,
        per_km: 2,
        per_min: 0.5,
        helper1_fee: 40,
        stair_fee: 15,
        difficult_access_fee: 25,
      },
      serviceDetails: {
        ajudantes: "um",
        retirada: { dificilAcesso: true, escadas: true, elevador: false, andar: 2 },
      },
    });
    expect(result.base).toBe(40);
    expect(result.extras).toEqual({
      "1 ajudante": 40,
      "Retirada: acesso difícil": 25,
      "Retirada: escadas": 30,
    });
    expect(result.total).toBe(135);
  });

  it("recusa envio acima do peso configurado", () => {
    expect(() =>
      calculateServerFare({
        category: "envios",
        distanceKm: 1,
        durationMin: 1,
        tariff: { base_fare: 5, per_kg: 0.5, max_weight_kg: 30 },
        serviceDetails: { weightKg: 31 },
      }),
    ).toThrow("Peso acima do máximo");
  });

  it("aplica adicionais de guincho sem alterar o preço base", () => {
    const result = calculateServerFare({
      category: "guincho",
      distanceKm: 5,
      durationMin: 0,
      tariff: {
        call_out_fee: 80,
        per_km: 4,
        accident_fee: 35,
        platform_fee: 40,
      },
      serviceDetails: { acidente: true, precisaPlataforma: true },
    });
    expect(result.base).toBe(100);
    expect(result.total).toBe(175);
  });
});
