import React from "react";
import { useCoupon } from "@/hooks/use-coupon";
import { Loader2, Ticket, X, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const CouponInput: React.FC = () => {
  const { code, setCode, validate, remove, status, isLoading, result } = useCoupon();

  return (
    <div className="w-full bg-zinc-900/50 border border-white/5 rounded-2xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <Ticket size={16} className="text-zinc-500" />
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Cupom de Desconto</p>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Possui um cupom?"
            disabled={status === "valid"}
            className={cn(
              "w-full bg-zinc-800 border border-white/5 rounded-xl py-3 px-4 text-sm font-bold placeholder:text-zinc-600 outline-none transition-all",
              status === "valid" && "border-emerald-500/50 text-emerald-500",
              status === "invalid" && "border-red-500/50 text-red-500"
            )}
          />
          {status === "valid" && (
            <CheckCircle2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" />
          )}
        </div>

        {status === "valid" ? (
          <button 
            onClick={remove}
            className="bg-zinc-800 text-zinc-400 p-3 rounded-xl active:scale-95 transition-all"
          >
            <X size={20} />
          </button>
        ) : (
          <button
            onClick={validate}
            disabled={!code || isLoading}
            className="bg-white text-black px-6 rounded-xl font-black text-xs uppercase tracking-wider active:scale-95 transition-all disabled:opacity-50"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : "Aplicar"}
          </button>
        )}
      </div>

      {result?.message && status !== "valid" && (
        <div className="flex items-center gap-1.5 mt-2 text-[10px] font-bold text-red-400">
          <AlertCircle size={10} />
          {result.message}
        </div>
      )}
    </div>
  );
};
