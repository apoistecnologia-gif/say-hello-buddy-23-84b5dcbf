import React from "react";
import { Anchor, Bike, Car, Check, Package, Truck } from "lucide-react";
import { usePricing } from "@/hooks/use-pricing";
import { useRideCategories } from "@/hooks/use-ride-categories";
import { cn } from "@/lib/utils";
import { PRICING_CONFIG } from "@/services/pricing/pricing-config";
import type { RideCategoryCode } from "@/types/pricing";

const IconMap: Record<RideCategoryCode, React.ElementType> = {
  carros: Car,
  motos: Bike,
  fretes: Truck,
  guincho: Anchor,
  envios: Package,
};

const fallbackDescription: Record<RideCategoryCode, string> = {
  carros: "Viagens confortáveis para o dia a dia",
  motos: "Agilidade para trajetos urbanos",
  fretes: "Mais espaço para o que você precisa",
  guincho: "Atendimento rápido e seguro",
  envios: "Entregas rápidas e seguras",
};

export const CategorySelector: React.FC = () => {
  const {
    categories,
    selectedCategory,
    selectCategory,
    isLoading: categoriesLoading,
  } = useRideCategories();
  const { estimates, status: pricingStatus } = usePricing();

  if (categoriesLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-[88px] w-full animate-pulse rounded-2xl border border-white/5 bg-zinc-900/60"
          />
        ))}
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="rounded-2xl border border-white/5 bg-zinc-900/50 px-4 py-3 text-center text-xs text-zinc-400">
        Não há categorias disponíveis para esta rota no momento.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {categories.map((category) => {
        const isSelected = selectedCategory?.id === category.id;
        const Icon = IconMap[category.code];
        const categoryLabel = PRICING_CONFIG.LABELS[category.code];
        const estimate = estimates.find((item) => item.categoryId === category.id);
        const isAvailable = estimate?.available !== false;
        const pickupMinutes = estimate?.estimatedPickupMinutes;
        const description = category.description?.trim() || fallbackDescription[category.code];

        return (
          <button
            key={category.id}
            type="button"
            onClick={() => isAvailable && selectCategory(category)}
            disabled={!isAvailable}
            aria-pressed={isSelected}
            className={cn(
              "app-pressable relative flex min-h-[88px] w-full items-center gap-3 overflow-hidden rounded-2xl border px-3 py-2.5 text-left transition-colors",
              isSelected
                ? "border-apois-yellow bg-apois-yellow/[0.08] shadow-[0_0_0_1px_rgba(255,184,0,0.08)]"
                : isAvailable
                  ? "border-white/8 bg-zinc-900/70"
                  : "cursor-not-allowed border-white/5 bg-zinc-900/35 opacity-55 grayscale",
            )}
          >
            <span className="flex h-[66px] w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-white/[0.07] to-transparent">
              {category.imageUrl ? (
                <img
                  src={category.imageUrl}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className="h-full w-full object-contain p-1"
                />
              ) : (
                <span
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-xl border",
                    isSelected
                      ? "border-apois-yellow/30 bg-apois-yellow/10 text-apois-yellow"
                      : "border-white/8 bg-black/20 text-zinc-400",
                  )}
                >
                  <Icon aria-hidden="true" size={24} strokeWidth={2.25} />
                </span>
              )}
            </span>

            <span className="min-w-0 flex-1 self-center">
              <span className="block truncate text-[14px] font-black leading-5 text-white">
                {categoryLabel || category.name}
              </span>
              <span className="mt-0.5 line-clamp-2 block text-[10px] font-medium leading-[14px] text-zinc-500">
                {description}
              </span>
            </span>

            <span className="flex min-w-[86px] shrink-0 flex-col items-end justify-center pl-1">
              <span
                className={cn(
                  "text-[15px] font-black tracking-tight",
                  isSelected ? "text-white" : "text-zinc-100",
                )}
              >
                {!isAvailable
                  ? "—"
                  : pricingStatus === "loading"
                    ? "Calculando"
                    : estimate
                      ? PRICING_CONFIG.CURRENCY_FORMAT.format(estimate.estimatedPrice)
                      : "—"}
              </span>
              <span
                className={cn(
                  "mt-1 min-h-[14px] text-[10px] font-black",
                  isSelected ? "text-apois-yellow" : "text-zinc-500",
                )}
              >
                {!isAvailable
                  ? "Indisponível"
                  : pricingStatus === "loading"
                    ? "aguarde..."
                    : typeof pickupMinutes === "number"
                      ? `${Math.max(1, Math.round(pickupMinutes))} min`
                      : category.etaLabel || ""}
              </span>
            </span>

            {isSelected ? (
              <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-apois-yellow text-black shadow-lg">
                <Check aria-hidden="true" size={13} strokeWidth={3.5} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
};
