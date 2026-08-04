import React from "react";
import { usePaymentMethods } from "@/hooks/use-payment-methods";
import { useWallet } from "@/hooks/use-wallet";
import { PRICING_CONFIG } from "@/services/pricing/pricing-config";
import { cn } from "@/lib/utils";
import { Wallet, ChevronRight } from "lucide-react";
import { PaymentMethodCode } from "@/types/payments";
import { PAYMENT_ICONS } from "@/services/payments/payment-config";

export const PaymentMethodSelector: React.FC<{ onOpenList: () => void }> = ({ onOpenList }) => {
  const { selectedMethod, methods, isLoading } = usePaymentMethods();
  const { wallet } = useWallet();
  
  const current = methods.find(m => m.code === selectedMethod);
  const Icon = current ? PAYMENT_ICONS[current.code] || Wallet : Wallet;

  if (isLoading) {
    return (
      <div className="w-full h-[72px] bg-zinc-900/50 border border-white/5 rounded-2xl animate-pulse" />
    );
  }

  return (
    <button 
      onClick={onOpenList}
      className="w-full bg-zinc-900/50 border border-white/5 rounded-2xl p-4 flex items-center justify-between active:scale-[0.98] transition-all"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400">
          <Icon size={20} />
        </div>
        <div className="text-left">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-0.5">Forma de Pagamento</p>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-white">
              {current?.name || current?.label || "Selecione o pagamento"}
            </h4>
            {selectedMethod === "wallet" && wallet && (
              <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                {PRICING_CONFIG.CURRENCY_FORMAT.format(wallet.available_balance)}
              </span>
            )}
          </div>
        </div>
      </div>
      <ChevronRight size={18} className="text-zinc-600" />
    </button>
  );
};


export const PaymentMethodList: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { methods, selectedMethod, selectMethod } = usePaymentMethods();
  const { wallet } = useWallet();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-black rounded-t-[32px] p-6 shadow-2xl animate-in slide-in-from-bottom duration-300 border-t border-zinc-800">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black text-white">Forma de Pagamento</h2>
          <button onClick={onClose} className="text-zinc-500 font-bold text-sm">Fechar</button>
        </div>

        <div className="space-y-2 mb-6">
          {methods.map((method) => {
            const Icon = PAYMENT_ICONS[method.code] || Wallet;
            const isSelected = selectedMethod === method.code;
            const isWallet = method.code === "wallet";
            const isDisabled = !method.isActive || (isWallet && (!wallet || wallet.status !== "active"));

            return (
              <button
                key={method.code}
                disabled={isDisabled}
                onClick={() => {
                  selectMethod(method.code);
                  onClose();
                }}
                className={cn(
                  "w-full p-4 rounded-2xl flex items-center justify-between border-2 transition-all",
                  isSelected 
                    ? "bg-zinc-800 border-apois-yellow" 
                    : "bg-zinc-900/50 border-transparent",
                  isDisabled && "opacity-40 grayscale"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
                    isSelected ? "bg-apois-yellow text-black" : "bg-zinc-800 text-zinc-400"
                  )}>
                    <Icon size={24} />
                  </div>
                  <div className="text-left">
                    <h4 className="font-bold text-white text-sm">{method.name || method.label}</h4>
                    <p className="text-[11px] text-zinc-500 font-medium">{method.description}</p>
                    {isWallet && wallet && (
                      <p className="text-[11px] text-emerald-500 font-bold mt-0.5">
                        Saldo: {PRICING_CONFIG.CURRENCY_FORMAT.format(wallet.available_balance)}
                      </p>
                    )}
                  </div>
                </div>
                {isSelected && <Check size={20} className="text-apois-yellow" />}
              </button>
            );
          })}

        </div>
      </div>
    </div>
  );
};
