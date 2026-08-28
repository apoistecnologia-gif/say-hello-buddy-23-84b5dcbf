export type ServiceDetails = Record<string, unknown> | null | undefined;

export type FareBreakdown = {
  base: number;
  extras: Record<string, number>;
  total: number;
};

function yes(value: unknown): boolean {
  return (
    value === true ||
    ["sim", "yes", "true", "1"].includes(
      String(value ?? "")
        .trim()
        .toLowerCase(),
    )
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nonNegativeNumber(value: unknown): number {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function rounded(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateServerFare(args: {
  category: string;
  distanceKm: number;
  durationMin: number;
  tariff: Record<string, number>;
  stopCount?: number;
  serviceDetails?: ServiceDetails;
}): FareBreakdown {
  const { category, tariff } = args;
  const distanceKm = Math.max(0, nonNegativeNumber(args.distanceKm));
  const durationMin = Math.max(0, nonNegativeNumber(args.durationMin));
  const stopCount = Math.max(0, Math.floor(nonNegativeNumber(args.stopCount)));
  const fixedFee = Math.max(0, tariff.fixed_fee ?? 0);
  const baseFare = Math.max(0, tariff.base_fare ?? tariff.call_out_fee ?? 0);
  const distanceFare = Math.max(0, tariff.per_km ?? 0) * distanceKm;
  const durationFare = Math.max(0, tariff.per_min ?? 0) * durationMin;
  const minimumFare = Math.max(0, tariff.min_fare ?? 0);
  const rawBase = fixedFee + baseFare + distanceFare + durationFare;
  const base = Math.max(minimumFare, rawBase);
  const details = record(args.serviceDetails);
  const extras: Record<string, number> = {};

  const add = (key: string, amount: number) => {
    if (Number.isFinite(amount) && amount > 0) extras[key] = rounded(amount);
  };

  add("Paradas adicionais", Math.max(0, tariff.stop_fee ?? 0) * stopCount);

  if (category === "fretes") {
    if (details.ajudantes === "um") add("1 ajudante", tariff.helper1_fee ?? 0);
    if (details.ajudantes === "dois") add("2 ajudantes", tariff.helper2_fee ?? 0);
    if (yes(details.itemPesado)) add("Item pesado", tariff.heavy_furniture_fee ?? 0);
    if (yes(details.desmontar)) add("Montagem/desmontagem", tariff.assembly_fee ?? 0);
    if (yes(details.embalar)) add("Embalagem", tariff.packing_fee ?? 0);

    for (const [label, location] of [
      ["Retirada", record(details.retirada)],
      ["Entrega", record(details.entrega)],
    ] as const) {
      if (yes(location.dificilAcesso)) {
        add(`${label}: acesso difícil`, tariff.difficult_access_fee ?? 0);
      }
      if (yes(location.escadas) && !yes(location.elevador)) {
        const floors = Math.max(1, nonNegativeNumber(location.andar));
        add(`${label}: escadas`, (tariff.stair_fee ?? 0) * floors);
      }
    }
  }

  if (category === "guincho") {
    if (["utilitario", "caminhonete"].includes(String(details.tipoVeiculo))) {
      add("Veículo pesado", tariff.heavy_vehicle_fee ?? 0);
    }
    if (yes(details.dificilAcesso)) add("Acesso difícil", tariff.difficult_access_fee ?? 0);
    if (yes(details.acidente)) add("Veículo acidentado", tariff.accident_fee ?? 0);
    if (yes(details.precisaPlataforma)) add("Plataforma", tariff.platform_fee ?? 0);
    if (yes(details.rodasTravadas)) add("Rodas travadas", tariff.locked_wheels_fee ?? 0);
    if (yes(details.garagemSubsolo)) add("Garagem/subsolo", tariff.garage_fee ?? 0);
  }

  if (category === "envios") {
    const weightKg = nonNegativeNumber(details.weightKg);
    const maxWeight = tariff.max_weight_kg ?? 0;
    if (maxWeight > 0 && weightKg > maxWeight) {
      throw new Error(`Peso acima do máximo de ${maxWeight} kg para Envios.`);
    }
    add("Peso", weightKg * (tariff.per_kg ?? 0));
  }

  const subtotal = base + Object.values(extras).reduce((sum, amount) => sum + amount, 0);
  const multiplier = Math.max(1, tariff.dynamic_multiplier ?? 1);
  const total = subtotal * multiplier;
  if (multiplier > 1) add("Ajuste de demanda", total - subtotal);

  return {
    base: rounded(base),
    extras,
    total: rounded(total),
  };
}
