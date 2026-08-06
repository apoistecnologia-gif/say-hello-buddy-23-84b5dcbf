import { Info, ShieldCheck } from "lucide-react";

interface SecurityCodeCardProps {
  code: string | undefined;
}

export function SecurityCodeCard({ code }: SecurityCodeCardProps) {
  const normalizedCode = code?.replace(/\s+/g, "").slice(0, 6) ?? "";
  if (!normalizedCode || !/^[A-Za-z0-9]+$/.test(normalizedCode)) return null;

  return (
    <section className="space-y-3 rounded-2xl border border-apois-yellow/20 bg-apois-yellow/8 p-4 animate-in fade-in zoom-in duration-500">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-apois-yellow" />
          <p className="text-[10px] font-black uppercase tracking-widest text-apois-yellow">
            PIN de segurança
          </p>
        </div>
        <Info size={14} className="text-zinc-600" />
      </div>

      <div
        className="flex items-center justify-center gap-2 rounded-xl border border-white/5 bg-black/40 p-4"
        aria-label={`PIN de segurança ${normalizedCode.split("").join(" ")}`}
      >
        {normalizedCode.split("").map((character, index) => (
          <div
            key={`${character}-${index}`}
            className="flex h-14 min-w-11 flex-1 items-center justify-center rounded-lg border border-white/8 bg-zinc-800 shadow-xl"
            aria-hidden="true"
          >
            <span className="text-2xl font-black uppercase text-white">{character}</span>
          </div>
        ))}
      </div>

      <p className="text-center text-[10px] font-medium leading-relaxed text-zinc-500">
        Confirme a placa e informe este código ao motorista somente quando estiver dentro do veículo.
        <span className="ml-1 font-bold text-white">Sem o PIN, a viagem não deve ser iniciada.</span>
      </p>
    </section>
  );
}
