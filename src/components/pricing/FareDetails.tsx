import React from "react";
import { Loader2 } from "lucide-react";
import { usePricing } from "@/hooks/use-pricing";
import { formatCurrency } from "@/lib/utils";

export const FareDetails: React.FC = () => {
  const { selectedEstimate, status, error } = usePricing();

  if (status === "loading") {
    return (
      <div className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-white/5 bg-zinc-900/35 px-3 py-2 text-xs font-medium leading-5 text-zinc-500" role="status" aria-live="polite">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <span className="break-words">Calculando o valor da categoria…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="break-words rounded-xl border border-red-500/15 bg-red-500/5 px-3 py-2 text-xs leading-5 text-red-300 [overflow-wrap:anywhere]" role="alert" aria-live="assertive">
        Não foi possível calcular o valor agora. Tente novamente.
      </div>
    );
  }
  if (!selectedEstimate) return null;

  const estimatedPrice = Number(selectedEstimate.estimatedPrice);
  const hasValidPrice = Number.isFinite(estimatedPrice) && estimatedPrice >= 0;
  const value = hasValidPrice ? formatCurrency(estimatedPrice) : "Valor indisponível";

  return (
    <section className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-xl border border-apois-yellow/10 bg-apois-yellow/[0.05] px-3 py-2.5 max-[339px]:grid-cols-1" aria-label="Resumo do valor da categoria">
      <span className="min-w-0 break-words text-xs font-bold leading-5 text-zinc-500">Valor estimado da categoria</span>
      <span
        className="max-w-full break-words text-base font-black tracking-tight text-apois-yellow max-[339px]:text-left"
        role="status"
        aria-live="polite"
        aria-label={hasValidPrice ? `Valor estimado ${value}` : "Valor estimado indisponível"}
      >
        {value}
      </span>
    </section>
  );
};
