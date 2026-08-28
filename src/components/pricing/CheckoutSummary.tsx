import { useCheckoutPreparation } from "@/hooks/use-checkout-preparation";
import { formatCurrency } from "@/lib/utils";

export function CheckoutSummary() {
  const { checkout } = useCheckoutPreparation();

  return (
    <div className="rounded-xl border border-white/5 bg-zinc-900/45 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">Preço estimado</p>
          <p className="mt-0.5 text-[9px] leading-3 text-zinc-600">Pode variar pela rota real e espera.</p>
        </div>
        <p className="shrink-0 text-lg font-black tracking-tight text-apois-yellow">
          {checkout.finalTotal > 0 ? formatCurrency(checkout.finalTotal) : "..."}
        </p>
      </div>
    </div>
  );
}
