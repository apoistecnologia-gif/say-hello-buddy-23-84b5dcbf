import React from "react";
import { usePricing } from "@/hooks/use-pricing";
import { useCoupon } from "@/hooks/use-coupon";
import { useCheckoutPreparation } from "@/hooks/use-checkout-preparation";
import { PRICING_CONFIG } from "@/services/pricing/pricing-config";
import { Info } from "lucide-react";

export const CheckoutSummary: React.FC = () => {
  const { estimate } = usePricing();
  const { discount, result: couponResult } = useCoupon();
  const { checkout } = useCheckoutPreparation();

  if (!estimate) return null;

  return (
    <div className="space-y-3 py-2">
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs font-medium text-zinc-500">
          <span>Subtotal estimado</span>
          <span>{PRICING_CONFIG.CURRENCY_FORMAT.format(estimate.total)}</span>
        </div>
        
        {discount > 0 && (
          <div className="flex justify-between text-xs font-bold text-emerald-500">
            <span>Desconto {couponResult?.code && `(${couponResult.code})`}</span>
            <span>-{PRICING_CONFIG.CURRENCY_FORMAT.format(discount)}</span>
          </div>
        )}

        {estimate.breakdown.extras.map((extra) => (
          <div key={extra.key} className="flex justify-between text-xs font-medium text-zinc-500">
            <span>{extra.label}</span>
            <span>{PRICING_CONFIG.CURRENCY_FORMAT.format(extra.value)}</span>
          </div>
        ))}
      </div>

      <div className="pt-3 border-t border-white/5 flex justify-between items-baseline">
        <span className="text-sm font-black text-white uppercase tracking-wider">Total Estimado</span>
        <span className="text-2xl font-black text-apois-yellow">
          {PRICING_CONFIG.CURRENCY_FORMAT.format(checkout.finalTotal)}
        </span>
      </div>

      <div className="flex items-center gap-1.5 justify-center mt-2 text-[9px] font-bold text-zinc-600 uppercase tracking-tighter text-center">
        <Info size={10} />
        O valor final será confirmado ao solicitar a corrida
      </div>
    </div>
  );
};
