import { useCheckoutPreparation } from "@/hooks/use-checkout-preparation";
import { formatCurrency } from "@/lib/utils";

export function CheckoutSummary() {
  const { checkout } = useCheckoutPreparation();

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <p className="text-xs text-zinc-500 font-medium">Estimativa da Viagem</p>
        <p className="text-sm font-bold text-zinc-300">
          {checkout.finalTotal > 0 ? formatCurrency(checkout.finalTotal) : "..."}
        </p>
      </div>
      <p className="text-[10px] text-zinc-600 leading-tight">
        * O valor final pode variar dependendo da rota real e do tempo de espera.
      </p>
    </div>
  );
}
