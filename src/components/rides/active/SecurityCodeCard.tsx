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
      className="overflow-hidden rounded-[24px] border border-apois-yellow/25 bg-zinc-950 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.95)] animate-in fade-in zoom-in duration-300"
      aria-label="Código PIN da corrida"
    >
      <div className="flex items-start gap-3 border-b border-white/5 bg-apois-yellow/[0.06] px-4 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-apois-yellow/20 bg-apois-yellow/10">
          <ShieldCheck className="text-apois-yellow" size={20} strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-apois-yellow">
            Código PIN da corrida
          </p>
          <h3 className="mt-1 text-[15px] font-black leading-tight text-white">
            Compartilhe com o motorista para iniciar
          </h3>
          <p className="mt-1 text-[11px] font-medium leading-relaxed text-zinc-400">
            Informe o código somente quando estiver com o motorista e confirmar o veículo.
          </p>
        </div>
      </div>

      <div className="px-4 py-5">
        <div
          className="grid grid-cols-4 gap-2.5"
          aria-label={`PIN ${normalizedCode.split("").join(" ")}`}
        >
          {normalizedCode.split("").map((digit, index) => (
            <div
              key={`${index}-${digit}`}
              aria-hidden="true"
              className="flex h-[68px] items-center justify-center rounded-2xl border border-apois-yellow/25 bg-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025),0_10px_28px_-18px_rgba(0,0,0,1)]"
            >
              <span className="text-[32px] font-black tabular-nums leading-none text-apois-yellow">
                {digit}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-white/5 bg-black/70 px-3.5 py-3">
          <LockKeyhole className="mt-0.5 shrink-0 text-apois-yellow" size={16} strokeWidth={2} />
          <p className="text-[11px] font-medium leading-relaxed text-zinc-400">
            Por segurança, não envie este PIN por mensagem e não informe antes do embarque.
          </p>
        </div>

        <p className="mt-3 text-center text-[11px] font-bold leading-relaxed text-white">
          A corrida só inicia depois que o motorista confirmar este PIN no aplicativo dele.
        </p>
      </div>
    </section>
  );
}
