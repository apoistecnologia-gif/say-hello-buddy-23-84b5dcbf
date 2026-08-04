import React from "react";
import { Info } from "lucide-react";

interface SecurityCodeCardProps {
  code: string | undefined;
}

export const SecurityCodeCard: React.FC<SecurityCodeCardProps> = ({ code }) => {
  if (!code) return null;

  return (
    <div className="bg-zinc-900/50 rounded-2xl p-4 border border-white/5 space-y-3 animate-in fade-in zoom-in duration-500">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
          PIN de Segurança
        </p>
        <Info size={14} className="text-zinc-600" />
      </div>

      <div className="flex justify-between items-center bg-black/40 rounded-xl p-4 border border-white/5">
        {code.split("").map((digit, i) => (
          <div
            key={i}
            className="w-12 h-14 bg-zinc-800 rounded-lg flex items-center justify-center border border-white/5 shadow-xl"
          >
            <span className="text-2xl font-black text-white">{digit}</span>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-zinc-500 text-center font-medium leading-relaxed">
        Informe este código ao motorista para{" "}
        <span className="text-white font-bold">iniciar a viagem com segurança.</span>
      </p>
    </div>
  );
};
