import { Ticket } from "lucide-react";

export function CouponInput() {
  return (
    <section className="min-w-0 rounded-xl border border-white/5 bg-zinc-900/45 px-3 py-2.5" aria-label="Cupons promocionais indisponíveis">
      <div className="flex min-w-0 items-start gap-2.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-500" aria-hidden="true">
          <Ticket size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="break-words text-[11px] font-black leading-4 text-zinc-300">Cupons promocionais</p>
          <p className="mt-0.5 break-words text-[10px] font-medium leading-4 text-zinc-500">
            Ainda indisponíveis. Nenhum desconto será incluído nesta corrida.
          </p>
        </div>
      </div>
    </section>
  );
}
