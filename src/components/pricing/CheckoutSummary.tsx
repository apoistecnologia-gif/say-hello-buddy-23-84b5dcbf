import { useCheckoutPreparation } from "@/hooks/use-checkout-preparation";
import { formatCurrency } from "@/lib/utils";

export function CheckoutSummary() {
  const { checkout } = useCheckoutPreparation();
  const hasPrice = checkout.finalTotal > 0;

  return (
    <div className="min-w-0 rounded-xl border border-white/5 bg-zinc-900/45 px-3 py-2.5">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-[160px] flex-1">
          <p className="break-words text-[10px] font-black uppercase tracking-wider text-zinc-500">Preço estimado</p>
          <p className="mt-0.5 break-words text-[10px] leading-4 text-zinc-500">Pode variar pela rota real e espera.</p>
        </div>
        <p
          className="max-w-full break-words text-[clamp(16px,6vw,18px)] font-black tracking-tight text-apois-yellow"
          role="status"
          aria-live="polite"
          aria-label={hasPrice ? `Preço estimado ${formatCurrency(checkout.finalTotal)}` : "Calculando preço estimado"}
        >
          {hasPrice ? formatCurrency(checkout.finalTotal) : "Calculando..."}
        </p>
      </div>
    </div>
  );
}
