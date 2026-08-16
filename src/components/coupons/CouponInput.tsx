import { Ticket } from "lucide-react";

export function CouponInput() {
  return (
    <section
      className="min-w-0 rounded-xl border border-white/5 bg-zinc-900/45 px-3 py-3"
      aria-labelledby="coupon-status-title"
      aria-describedby="coupon-status-description"
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-zinc-500" aria-hidden="true">
          <Ticket size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p id="coupon-status-title" className="break-words text-xs font-black leading-5 text-zinc-300">
            Cupons promocionais
          </p>
          <p id="coupon-status-description" className="mt-0.5 break-words text-xs font-medium leading-5 text-zinc-500 [overflow-wrap:anywhere]">
            Ainda indisponíveis. Nenhum desconto será incluído nesta corrida.
          </p>
        </div>
      </div>
    </section>
  );
}
