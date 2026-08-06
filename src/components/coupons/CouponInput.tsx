import { Ticket } from "lucide-react";

export function CouponInput() {
  return (
    <section className="rounded-2xl border border-white/5 bg-zinc-900/50 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-zinc-500">
          <Ticket size={17} />
        </div>
        <div>
          <p className="text-xs font-black text-zinc-300">Cupons promocionais</p>
          <p className="mt-1 text-[10px] font-medium leading-4 text-zinc-600">
            Ainda não há cupons disponíveis para aplicação no servidor. Nenhum desconto será prometido ou incluído no valor desta corrida.
          </p>
        </div>
      </div>
    </section>
  );
}
