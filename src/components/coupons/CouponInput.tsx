import { Ticket } from "lucide-react";

export function CouponInput() {
  return (
    <section className="rounded-xl border border-white/5 bg-zinc-900/45 px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-500">
          <Ticket size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black text-zinc-300">Cupons promocionais</p>
          <p className="mt-0.5 text-[9px] font-medium leading-3.5 text-zinc-600">
            Ainda indisponíveis no servidor. Nenhum desconto será incluído nesta corrida.
          </p>
        </div>
      </div>
    </section>
  );
}
