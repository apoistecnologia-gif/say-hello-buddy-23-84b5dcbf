import React from "react";
import { useRideCategories } from "@/hooks/use-ride-categories";
import { usePricing } from "@/hooks/use-pricing";
import { PRICING_CONFIG } from "@/services/pricing/pricing-config";
import { cn } from "@/lib/utils";
import { Car, Bike, Truck, Anchor, Package } from "lucide-react";
import { RideCategoryKey } from "@/types/pricing";

const IconMap: Record<RideCategoryKey, React.ElementType> = {
  carros: Car,
  motos: Bike,
  fretes: Truck,
  guincho: Anchor,
  envios: Package,
};

export const CategorySelector: React.FC = () => {
  const { categories, selectedCategory, selectCategory, isLoading } = useRideCategories();
  const { estimate, status } = usePricing();

  if (isLoading) {
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
        Os serviços estão temporariamente indisponíveis.
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar px-4 scroll-smooth">
      {categories.map((cat) => {
        const isSelected = selectedCategory?.key === cat.key;
        const Icon = IconMap[cat.key] || Car;
        const categoryLabel = PRICING_CONFIG.LABELS[cat.key] || cat.label;

        return (
          <button
            key={cat.key}
            onClick={() => selectCategory(cat)}
            className={cn(
              "flex-shrink-0 w-32 p-4 rounded-2xl flex flex-col items-center justify-between transition-all active:scale-95 border-2",
              isSelected 
                ? "bg-apois-yellow border-apois-yellow text-black shadow-lg shadow-apois-yellow/20" 
                : "bg-zinc-900/80 border-transparent text-zinc-400"
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
              <span className="text-[11px] font-medium opacity-80 mt-1 block">
                {isSelected && estimate 
                  ? PRICING_CONFIG.CURRENCY_FORMAT.format(estimate.total)
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
