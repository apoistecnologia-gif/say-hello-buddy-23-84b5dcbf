import React from "react";
import { usePricing } from "@/hooks/use-pricing";
import { formatCurrency } from "@/lib/utils";

export const FareDetails: React.FC = () => {
  const { selectedEstimate, status, error } = usePricing();

  if (status === "loading") return null;
  if (error) return <div className="px-6 py-2 text-red-500 text-xs">{error}</div>;
  if (!selectedEstimate) return null;

  return (
    <div className="px-6 py-4">
      <div className="flex justify-between items-center bg-zinc-900/50 p-4 rounded-2xl border border-white/5">
        <span className="text-sm font-bold text-zinc-400">Valor Estimado</span>
        <span className="text-xl font-black text-apois-yellow">
          {formatCurrency(selectedEstimate.estimatedPrice)}
        </span>
      </div>
    </div>
  );
};
