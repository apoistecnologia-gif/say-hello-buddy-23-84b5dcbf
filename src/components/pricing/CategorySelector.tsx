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
  motos: "Agilidade para fugir do trânsito",
  fretes: "Mais espaço para o que você precisa",
  guincho: "Atendimento rápido e seguro",
  envios: "Entregas rápidas e seguras",
};

function VehicleArtwork({ code }: { code: RideCategoryCode }) {
  if (code === "carros") {
    return (
      <svg viewBox="0 0 132 72" className="h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id="carBody" x1="0" x2="1">
            <stop offset="0" stopColor="#111827" />
            <stop offset="0.55" stopColor="#374151" />
            <stop offset="1" stopColor="#0b0f16" />
          </linearGradient>
        </defs>
        <ellipse cx="67" cy="60" rx="50" ry="5" fill="#000" opacity=".45" />
        <path d="M24 46 33 31c2-4 6-7 11-8l37-3c7-.5 12 2 17 8l10 13 10 3c3 1 5 4 5 7v5H18v-5c0-3 2-5 6-5Z" fill="url(#carBody)" stroke="#6b7280" strokeWidth="1.3" />
        <path d="M42 30c2-3 5-4 9-5l26-2c6 0 9 1 13 6l7 9H36l6-8Z" fill="#111827" stroke="#9ca3af" strokeWidth="1" />
        <path d="M47 28h17v10H39l8-10Zm20 0h13c3 0 5 1 7 4l4 6H67V28Z" fill="#1f2937" />
        <path d="M20 49h101M28 44h12M101 44h13" stroke="#fbbf24" strokeWidth="1.5" opacity=".7" />
        <circle cx="39" cy="55" r="9" fill="#05070a" stroke="#6b7280" strokeWidth="2" />
        <circle cx="39" cy="55" r="4" fill="#9ca3af" />
        <circle cx="101" cy="55" r="9" fill="#05070a" stroke="#6b7280" strokeWidth="2" />
        <circle cx="101" cy="55" r="4" fill="#9ca3af" />
      </svg>
    );
  }

  if (code === "motos") {
    return (
      <svg viewBox="0 0 132 72" className="h-full w-full" aria-hidden="true">
        <ellipse cx="67" cy="62" rx="46" ry="4" fill="#000" opacity=".42" />
        <circle cx="35" cy="54" r="13" fill="#06080c" stroke="#6b7280" strokeWidth="2" />
        <circle cx="101" cy="54" r="13" fill="#06080c" stroke="#6b7280" strokeWidth="2" />
        <circle cx="35" cy="54" r="6" fill="#1f2937" />
        <circle cx="101" cy="54" r="6" fill="#1f2937" />
        <path d="m36 54 19-18 18 2 12 16M55 36l-7 18m7-18 13 18m5-16 18-11m0 0 10 27M89 27h12" fill="none" stroke="#9ca3af" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M55 34h22c4 0 8 2 10 5l6 8H69l-14-13Z" fill="#111827" stroke="#374151" strokeWidth="1.5" />
        <path d="M72 29h17l-8 7H69l3-7Z" fill="#f59e0b" opacity=".85" />
        <path d="M47 31h12" stroke="#6b7280" strokeWidth="4" strokeLinecap="round" />
      </svg>
    );
  }

  if (code === "fretes") {
    return (
      <svg viewBox="0 0 132 72" className="h-full w-full" aria-hidden="true">
        <ellipse cx="67" cy="62" rx="50" ry="4" fill="#000" opacity=".4" />
        <path d="M28 16h62c5 0 8 3 8 8v28H23V22c0-4 2-6 5-6Z" fill="#e5e7eb" stroke="#9ca3af" strokeWidth="1.4" />
        <path d="M98 29h10c4 0 7 2 9 6l7 13v5H98V29Z" fill="#d1d5db" stroke="#9ca3af" strokeWidth="1.4" />
        <path d="M104 33h7l6 11h-13V33Z" fill="#374151" />
        <path d="M31 23h45M31 29h45" stroke="#f9fafb" strokeWidth="2" opacity=".8" />
        <rect x="83" y="22" width="6" height="25" rx="2" fill="#9ca3af" />
        <circle cx="43" cy="54" r="9" fill="#080b10" stroke="#6b7280" strokeWidth="2" />
        <circle cx="43" cy="54" r="4" fill="#9ca3af" />
        <circle cx="108" cy="54" r="9" fill="#080b10" stroke="#6b7280" strokeWidth="2" />
        <circle cx="108" cy="54" r="4" fill="#9ca3af" />
      </svg>
    );
  }

  if (code === "guincho") {
    return (
      <svg viewBox="0 0 132 72" className="h-full w-full" aria-hidden="true">
        <ellipse cx="67" cy="62" rx="52" ry="4" fill="#000" opacity=".4" />
        <path d="M20 38h42l19 14H20V38Z" fill="#e5e7eb" stroke="#9ca3af" strokeWidth="1.2" />
        <path d="M62 31h18l12 10v11H62V31Z" fill="#d1d5db" stroke="#9ca3af" strokeWidth="1.2" />
        <path d="M68 34h10l8 7H68v-7Z" fill="#374151" />
        <path d="M85 24h8l6 26" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
        <path d="M94 24h19M113 24l-7 17" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
        <path d="M28 37h32" stroke="#f59e0b" strokeWidth="3" />
        <circle cx="39" cy="54" r="9" fill="#080b10" stroke="#6b7280" strokeWidth="2" />
        <circle cx="39" cy="54" r="4" fill="#9ca3af" />
        <circle cx="79" cy="54" r="9" fill="#080b10" stroke="#6b7280" strokeWidth="2" />
        <circle cx="79" cy="54" r="4" fill="#9ca3af" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 132 72" className="h-full w-full" aria-hidden="true">
      <ellipse cx="66" cy="61" rx="40" ry="4" fill="#000" opacity=".35" />
      <path d="M34 24 65 14l34 14v29L65 66 34 55V24Z" fill="#b97836" stroke="#e3b36d" strokeWidth="1.5" />
      <path d="m34 24 31 11 34-7M65 35v31" fill="none" stroke="#e7bb7c" strokeWidth="1.5" />
      <path d="m48 19 31 11 13-5-30-10-14 4Z" fill="#d49750" />
      <path d="M54 31v10l8 3V34" fill="#f1d2a4" opacity=".9" />
    </svg>
  );
}

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
            className="h-[92px] w-full animate-pulse rounded-2xl bg-zinc-900/60"
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
              "app-pressable relative flex min-h-[92px] w-full items-center gap-2.5 overflow-hidden rounded-2xl border px-2.5 py-2 text-left transition-colors",
              isSelected
                ? "border-apois-yellow bg-apois-yellow/[0.07] shadow-[0_0_0_1px_rgba(255,184,0,0.16)]"
                : isAvailable
                  ? "border-white/8 bg-[#111317]"
                  : "cursor-not-allowed border-white/5 bg-zinc-900/35 opacity-55 grayscale",
            )}
          >
            <span className="relative flex h-[72px] w-[102px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-white/[0.055] via-transparent to-black/20">
              <span
                className={cn(
                  "absolute left-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full border",
                  isSelected
                    ? "border-apois-yellow/40 bg-black/70 text-apois-yellow"
                    : "border-white/10 bg-black/60 text-zinc-400",
                )}
              >
                <Icon size={13} strokeWidth={2.4} />
              </span>
              {category.imageUrl ? (
                <img
                  src={category.imageUrl}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className="h-full w-full object-contain p-1"
                />
              ) : (
                <VehicleArtwork code={category.code} />
              )}
            </span>

            <span className="min-w-0 flex-1 self-center">
              <span className="block truncate text-[13px] font-black leading-4 text-white">
                {categoryLabel || category.name}
              </span>
              <span className="mt-1 line-clamp-2 block text-[10px] font-medium leading-[13px] text-zinc-500">
                {description}
              </span>
            </span>

            <span className="flex min-w-[78px] shrink-0 flex-col items-end justify-center pl-1 pr-1">
              <span className="text-[14px] font-black tracking-tight text-white">
                {!isAvailable
                  ? "—"
                  : pricingStatus === "loading"
                    ? "..."
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
                    ? "calculando"
                    : typeof pickupMinutes === "number"
                      ? `${Math.max(1, Math.round(pickupMinutes))} min`
                      : category.etaLabel || ""}
              </span>
            </span>

            {isSelected ? (
              <span className="absolute bottom-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-apois-yellow text-black shadow-lg">
                <Check aria-hidden="true" size={13} strokeWidth={3.5} />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
};
