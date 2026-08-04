import { useState } from "react";
import { useCoupon } from "@/hooks/use-coupon";
// Import removed because input is local // Using basic components available or mock
import { Ticket, X, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function CouponInput() {
  const [code, setCode] = useState("");
  const { coupon, status, validateCoupon, removeCoupon, isAvailable } = useCoupon();

  const handleApply = () => {
    if (!code.trim()) return;
    validateCoupon(code);
  };

  if (coupon && coupon.valid === false && coupon.message) {
    return (
      <div className="bg-zinc-900/50 rounded-2xl p-4 border border-white/5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ticket size={16} className="text-zinc-500" />
            <span className="text-xs font-bold text-zinc-400">Cupom</span>
          </div>
          <button onClick={removeCoupon} className="text-zinc-500">
            <X size={16} />
          </button>
        </div>
        <div className="flex items-start gap-2 text-zinc-500">
           <AlertCircle size={14} className="shrink-0 mt-0.5" />
           <p className="text-[10px] leading-tight">{coupon.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/50 rounded-2xl p-4 border border-white/5 space-y-3">
      <div className="flex items-center gap-2">
        <Ticket size={16} className="text-zinc-500" />
        <span className="text-xs font-bold text-zinc-400">Possui um cupom?</span>
      </div>
      
      <div className="relative flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="CÓDIGO"
          className="flex-1 bg-zinc-800 border-none rounded-xl px-4 py-3 text-sm font-black tracking-widest placeholder:text-zinc-600 focus:ring-1 focus:ring-apois-yellow/50 transition-all"
        />
        <button
          onClick={handleApply}
          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 rounded-xl text-xs font-black uppercase transition-all"
        >
          Aplicar
        </button>
      </div>
      {!isAvailable && (
        <p className="text-[9px] text-zinc-600 font-medium">Cupons estarão disponíveis após integração com o servidor.</p>
      )}
    </div>
  );
}
