import React from "react";
import { Anchor, Bike, Car, Package, Truck } from "lucide-react";
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
      <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-4">
        {[1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-32 w-28 shrink-0 animate-pulse rounded-2xl bg-zinc-900/50"
          />
        ))}
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="px-6 py-4 text-center text-sm text-zinc-400">
        Não há categorias disponíveis para esta rota no momento.
      </div>
    );
  }

  return (
    <div className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-4 pb-4 scroll-smooth">
      {categories.map((category) => {
        const isSelected = selectedCategory?.id === category.id;
        const Icon = IconMap[category.code];
        const categoryLabel = PRICING_CONFIG.LABELS[category.code];
        const estimate = estimates.find((item) => item.categoryId === category.id);
        const isAvailable = estimate?.available !== false;

        return (
          <button
            key={category.id}
            type="button"
            onClick={() => isAvailable && selectCategory(category)}
            disabled={!isAvailable}
            aria-pressed={isSelected}
            className={cn(
              "app-pressable flex w-32 shrink-0 snap-start flex-col items-center justify-between rounded-2xl border-2 p-4",
              isSelected
                ? "border-apois-yellow bg-apois-yellow text-black shadow-lg shadow-apois-yellow/20"
                : isAvailable
                  ? "border-transparent bg-zinc-900/80 text-zinc-400"
                  : "cursor-not-allowed border-transparent bg-zinc-900/40 text-zinc-600 grayscale",
            )}
          >
            <span
              className={cn(
                "rounded-xl p-2",
                isSelected ? "bg-black/10" : "bg-zinc-800",
              )}
            >
              <Icon aria-hidden="true" size={28} strokeWidth={2.5} />
            </span>

            <span className="mt-3 text-center">
              <span className="block w-24 truncate text-[13px] font-bold leading-tight">
                {categoryLabel || category.name}
              </span>
              <span
                className={cn(
                  "mt-1 block text-[11px] font-black",
                  isSelected ? "text-black/70" : "text-apois-yellow",
                )}
              >
                {!isAvailable
                  ? "Indisponível"
                  : pricingStatus === "loading"
                    ? "Calculando..."
                    : estimate
                      ? PRICING_CONFIG.CURRENCY_FORMAT.format(estimate.estimatedPrice)
                      : "—"}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
};
