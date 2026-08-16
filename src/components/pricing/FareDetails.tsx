import React from "react";
import { usePricing } from "@/hooks/use-pricing";
import { formatCurrency } from "@/lib/utils";

export const FareDetails: React.FC = () => {
  const { selectedEstimate, status, error } = usePricing();

  if (status === "loading") return null;
  if (error) {
    return (
      <div className="break-words px-1 py-1 text-[10px] leading-4 text-red-400" role="alert">
        {error}
      </div>
    );
  }
  if (!selectedEstimate) return null;

  const value = formatCurrency(selectedEstimate.estimatedPrice);

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-apois-yellow/10 bg-apois-yellow/[0.05] px-3 py-2">
      <span className="min-w-[120px] flex-1 break-words text-[10px] font-bold text-zinc-500">Valor da categoria</span>
      <span className="max-w-full break-words text-base font-black tracking-tight text-apois-yellow" aria-label={`Valor estimado ${value}`}>
        {value}
      </span>
    </div>
  );
};
