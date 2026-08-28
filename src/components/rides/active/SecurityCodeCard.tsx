import { LockKeyhole, ShieldCheck } from "lucide-react";

interface SecurityCodeCardProps {
  code: string | undefined;
}

export function SecurityCodeCard({ code }: SecurityCodeCardProps) {
  const normalizedCode = code?.replace(/\D/g, "").slice(0, 4) ?? "";

  // O fluxo do motorista valida exatamente quatro dígitos. Não exibimos um
  // código parcial para evitar que o passageiro compartilhe um PIN inválido.
  if (!/^\d{4}$/.test(normalizedCode)) return null;

  return (
    <section
      className="overflow-hidden rounded-[20px] border border-apois-yellow/25 bg-zinc-950 shadow-[0_16px_40px_-28px_rgba(0,0,0,0.95)] animate-in fade-in zoom-in duration-300"
      aria-label="Código PIN da corrida"
    >
      <div className="flex items-start gap-2.5 border-b border-white/5 bg-apois-yellow/[0.06] px-3.5 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-apois-yellow/20 bg-apois-yellow/10">
          <ShieldCheck className="text-apois-yellow" size={18} strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-apois-yellow">
            PIN da corrida
          </p>
          <h3 className="mt-0.5 text-[13px] font-black leading-4 text-white">
            Informe ao motorista no embarque
          </h3>
          <p className="mt-0.5 line-clamp-2 text-[10px] font-medium leading-4 text-zinc-400">
            Confirme o veículo antes de compartilhar o código.
          </p>
        </div>
      </div>

      <div className="px-3.5 py-3">
        <div
          className="grid grid-cols-4 gap-2"
          aria-label={`PIN ${normalizedCode.split("").join(" ")}`}
        >
          {normalizedCode.split("").map((digit, index) => (
            <div
              key={`${index}-${digit}`}
              aria-hidden="true"
              className="flex h-12 items-center justify-center rounded-xl border border-apois-yellow/25 bg-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025),0_8px_22px_-18px_rgba(0,0,0,1)]"
            >
              <span className="text-[26px] font-black tabular-nums leading-none text-apois-yellow">
                {digit}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-white/5 bg-black/70 px-3 py-2">
          <LockKeyhole className="mt-0.5 shrink-0 text-apois-yellow" size={14} strokeWidth={2} />
          <p className="text-[9px] font-medium leading-4 text-zinc-400">
            Não envie o PIN por mensagem. A corrida só inicia após a confirmação no app do motorista.
          </p>
        </div>
      </div>
    </section>
  );
}
