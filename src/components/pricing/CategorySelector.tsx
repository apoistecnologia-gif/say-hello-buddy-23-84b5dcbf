import React from "react";
import { useRideCategories } from "@/hooks/use-ride-categories";
import { usePricing } from "@/hooks/use-pricing";
import { PRICING_CONFIG } from "@/services/pricing/pricing-config";
import { cn } from "@/lib/utils";
import { Car, Bike, Truck, Anchor, Package } from "lucide-react";
import { RideCategoryCode } from "@/types/pricing";

const IconMap: Record<RideCategoryCode, React.ElementType> = {
  carro: Car,
  moto: Bike,
  fretes: Truck,
  guincho: Anchor,
  envios: Package,
};

export const CategorySelector: React.FC = () => {
  const { categories, selectedCategory, selectCategory, isLoading: categoriesLoading } = useRideCategories();
  const { estimates, status: pricingStatus } = usePricing();

  if (categoriesLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar px-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex-shrink-0 w-28 h-32 bg-zinc-900/50 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="px-6 py-4 text-center text-zinc-400 text-sm">
        Não há categorias disponíveis para esta rota no momento.
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar px-4 scroll-smooth">
      {categories.map((cat) => {
        const isSelected = selectedCategory?.id === cat.id;
        const Icon = IconMap[cat.key] || Car;
        const categoryLabel = PRICING_CONFIG.LABELS[cat.key] || cat.name;
        const estimate = estimates.find(e => e.categoryId === cat.id);
        const isAvailable = estimate?.available !== false;

        return (
          <button
            key={cat.id}
            onClick={() => isAvailable && selectCategory(cat)}
            disabled={!isAvailable}
            className={cn(
              "flex-shrink-0 w-32 p-4 rounded-2xl flex flex-col items-center justify-between transition-all active:scale-95 border-2",
              isSelected 
                ? "bg-apois-yellow border-apois-yellow text-black shadow-lg shadow-apois-yellow/20" 
                : isAvailable 
                  ? "bg-zinc-900/80 border-transparent text-zinc-400"
                  : "bg-zinc-900/40 border-transparent text-zinc-600 grayscale cursor-not-allowed"
            )}
          >
            <div className={cn(
              "p-2 rounded-xl",
              isSelected ? "bg-black/10" : "bg-zinc-800"
            )}>
              <Icon size={28} strokeWidth={2.5} />
            </div>
            
            <div className="text-center mt-3">
              <span className="text-[13px] font-bold block leading-tight truncate w-24">
                {categoryLabel}
              </span>
              <span className={cn(
                "text-[11px] font-black mt-1 block",
                isSelected ? "text-black/70" : "text-apois-yellow"
              )}>
                {!isAvailable 

                  ? "Indisponível"
                  : pricingStatus === "loading"
                    ? "Calculando..."
                    : estimate
                      ? PRICING_CONFIG.CURRENCY_FORMAT.format(estimate.estimatedPrice)
                      : "..."
                }
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
};
