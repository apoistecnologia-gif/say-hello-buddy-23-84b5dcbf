import React from "react";
import { usePricing } from "@/hooks/use-pricing";
import { PRICING_CONFIG } from "@/services/pricing/pricing-config";
import { Info } from "lucide-react";

export const FareDetails: React.FC = () => {
  const { estimate, status, error } = usePricing();

  if (status === "loading") {
    return <div className="h-6 w-32 bg-zinc-800 animate-pulse rounded mx-auto" />;
  }

  if (error === "tariff_missing" || error === "tariff_invalid") {
    return <div className="text-red-400 text-xs text-center">Preço indisponível</div>;
  }

  if (!estimate) return null;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-black text-white">
          {PRICING_CONFIG.CURRENCY_FORMAT.format(estimate.total)}
        </span>
      </div>
      <div className="flex items-center gap-1 text-[10px] text-zinc-500 uppercase tracking-wider font-bold">
        <Info size={10} />
        Valor estimado
      </div>
    </div>
  );
};
