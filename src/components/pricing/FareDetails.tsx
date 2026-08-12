import React from "react";
import { usePricing } from "@/hooks/use-pricing";
import { formatCurrency } from "@/lib/utils";

export const FareDetails: React.FC = () => {
  const { selectedEstimate, status, error } = usePricing();

  if (status === "loading") return null;
  if (error) return <div className="px-1 py-1 text-[10px] text-red-400">{error}</div>;
  if (!selectedEstimate) return null;

  return (
    <div className="flex items-center justify-between rounded-xl border border-apois-yellow/10 bg-apois-yellow/[0.05] px-3 py-2">
      <span className="text-[10px] font-bold text-zinc-500">Valor da categoria</span>
      <span className="text-base font-black tracking-tight text-apois-yellow">
        {formatCurrency(selectedEstimate.estimatedPrice)}
      </span>
    </div>
  );
};
