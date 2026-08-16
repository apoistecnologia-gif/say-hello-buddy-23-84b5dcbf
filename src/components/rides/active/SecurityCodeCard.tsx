import { LockKeyhole, ShieldCheck } from "lucide-react";

interface SecurityCodeCardProps {
  code: string | undefined;
}

export function SecurityCodeCard({ code }: SecurityCodeCardProps) {
  const normalizedCode = String(code ?? "").replace(/\D/g, "").slice(0, 4);

  if (!/^\d{4}$/.test(normalizedCode)) return null;

  const spokenPin = normalizedCode.split("").join(" ");

  return (
    <section
      className="min-w-0 overflow-hidden rounded-[20px] border border-apois-yellow/25 bg-zinc-950 shadow-[0_16px_40px_-28px_rgba(0,0,0,0.95)] animate-in fade-in zoom-in duration-300 motion-reduce:animate-none"
      aria-labelledby="ride-pin-title"
      aria-describedby="ride-pin-help"
      role="status"
      aria-live="polite"
    >
      <div className="flex min-w-0 items-start gap-3 border-b border-white/5 bg-apois-yellow/[0.06] px-3.5 py-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-apois-yellow/20 bg-apois-yellow/10" aria-hidden="true">
          <ShieldCheck className="text-apois-yellow" size={19} strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="break-words text-xs font-black uppercase leading-5 tracking-wide text-apois-yellow">PIN da corrida</p>
          <h3 id="ride-pin-title" className="mt-0.5 break-words text-sm font-black leading-5 text-white">
            Informe ao motorista no embarque
          </h3>
          <p className="mt-0.5 break-words text-xs font-medium leading-5 text-zinc-400 [overflow-wrap:anywhere]">
            Confirme o veículo antes de compartilhar o código.
          </p>
        </div>
      </div>

      <div className="px-3.5 py-3">
        <div
          className="grid min-w-0 grid-cols-4 gap-2 max-[339px]:gap-1.5"
          aria-label={`PIN ${spokenPin}`}
          role="group"
        >
          {normalizedCode.split("").map((digit, index) => (
            <div
              key={`pin-${index}`}
              aria-hidden="true"
              className="flex h-14 min-w-0 items-center justify-center rounded-xl border border-apois-yellow/25 bg-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025),0_8px_22px_-18px_rgba(0,0,0,1)] max-[339px]:h-12"
            >
              <span className="text-[clamp(22px,8vw,28px)] font-black tabular-nums leading-none text-apois-yellow">{digit}</span>
            </div>
          ))}
        </div>
        <span className="sr-only">Código de segurança: {spokenPin}</span>

        <div id="ride-pin-help" className="mt-3 flex min-w-0 items-start gap-2.5 rounded-xl border border-white/5 bg-black/70 px-3 py-2.5" role="note">
          <LockKeyhole className="mt-0.5 shrink-0 text-apois-yellow" size={16} strokeWidth={2} aria-hidden="true" />
          <p className="min-w-0 break-words text-xs font-medium leading-5 text-zinc-400 [overflow-wrap:anywhere]">
            Não envie o PIN por mensagem. A corrida só começa depois que você confirmar o veículo e informar o código ao motorista.
          </p>
        </div>
      </div>
    </section>
  );
}
