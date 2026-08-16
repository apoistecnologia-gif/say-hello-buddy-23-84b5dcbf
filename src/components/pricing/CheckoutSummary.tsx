import { useCheckoutPreparation } from "@/hooks/use-checkout-preparation";
import { formatCurrency } from "@/lib/utils";

export function CheckoutSummary() {
  const { checkout } = useCheckoutPreparation();
  const finalTotal = Number(checkout.finalTotal);
  const hasPrice = Number.isFinite(finalTotal) && finalTotal > 0;
  const priceLabel = hasPrice ? formatCurrency(finalTotal) : "Calculando valor";

  return (
    <section className="min-w-0 rounded-xl border border-white/5 bg-zinc-900/45 px-3 py-3" aria-labelledby="checkout-price-title">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 max-[339px]:grid-cols-1">
        <div className="min-w-0">
          <p id="checkout-price-title" className="break-words text-xs font-black uppercase leading-5 tracking-wide text-zinc-500">
            Preço estimado
          </p>
          <p className="mt-0.5 break-words text-xs leading-5 text-zinc-500 [overflow-wrap:anywhere]">
            O valor pode variar conforme a rota realizada e o tempo de espera.
          </p>
        </div>
        <p
          className="max-w-full break-words text-[clamp(17px,6vw,20px)] font-black tracking-tight text-apois-yellow max-[339px]:text-left"
          role="status"
          aria-live="polite"
          aria-label={hasPrice ? `Preço estimado ${priceLabel}` : "Calculando preço estimado"}
        >
          {hasPrice ? priceLabel : "Calculando…"}
        </p>
      </div>
    </section>
  );
}
