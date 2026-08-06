import type { ReactNode } from "react";
import { AlertCircle, Check, ChevronRight, Loader2, RefreshCw, Wallet, X } from "lucide-react";
import { usePaymentMethods } from "@/hooks/use-payment-methods";
import { useWallet } from "@/hooks/use-wallet";
import { PRICING_CONFIG } from "@/services/pricing/pricing-config";
import { PAYMENT_ICONS } from "@/services/payments/payment-config";
import { cn } from "@/lib/utils";

export function PaymentMethodSelector({ onOpenList }: { onOpenList: () => void }) {
  const { selectedMethod, methods, isLoading, error, refresh } = usePaymentMethods();
  const { wallet } = useWallet();

  const current = methods.find((method) => method.code === selectedMethod);
  const Icon = current ? PAYMENT_ICONS[current.code] || Wallet : Wallet;

  if (isLoading) {
    return (
      <div className="flex h-[72px] w-full items-center justify-center rounded-2xl border border-white/5 bg-zinc-900/50">
        <Loader2 className="animate-spin text-apois-yellow" size={20} />
      </div>
    );
  }

  if (error || methods.length === 0) {
    return (
      <section className="rounded-2xl border border-red-500/20 bg-red-500/8 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 shrink-0 text-red-400" size={19} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-white">Pagamento indisponível</p>
            <p className="mt-1 text-[10px] leading-4 text-red-200/70">
              {error ?? "Nenhuma forma de pagamento está ativa no momento."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="app-pressable mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/20 text-xs font-black text-white"
        >
          <RefreshCw size={15} />
          Carregar novamente
        </button>
      </section>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenList}
      className="app-pressable flex w-full items-center justify-between rounded-2xl border border-white/5 bg-zinc-900/50 p-4"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400">
          <Icon size={20} />
        </div>
        <div className="min-w-0 text-left">
          <p className="mb-0.5 text-[10px] font-black uppercase tracking-widest text-zinc-500">
            Forma de pagamento
          </p>
          <div className="flex min-w-0 items-center gap-2">
            <h4 className="truncate text-sm font-bold text-white">
              {current?.name || current?.label || "Selecione o pagamento"}
            </h4>
            {selectedMethod === "wallet" && wallet ? (
              <span className="shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-500">
                {PRICING_CONFIG.CURRENCY_FORMAT.format(wallet.available_balance)}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <ChevronRight size={18} className="shrink-0 text-zinc-600" />
    </button>
  );
}

export function PaymentMethodList({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { methods, selectedMethod, selectMethod } = usePaymentMethods();
  const { wallet } = useWallet();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-method-title"
        className="w-full max-w-lg rounded-t-[32px] border-t border-zinc-800 bg-black p-6 shadow-2xl animate-in slide-in-from-bottom duration-300"
      >
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 id="payment-method-title" className="text-xl font-black text-white">
            Forma de pagamento
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar formas de pagamento"
            className="app-pressable flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-zinc-400"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mb-6 space-y-2">
          {methods.map((method) => {
            const Icon = PAYMENT_ICONS[method.code] || Wallet;
            const isSelected = selectedMethod === method.code;
            const isWallet = method.code === "wallet";
            const isDisabled =
              !method.isActive ||
              !method.enabled ||
              (isWallet && (!wallet || wallet.status !== "active"));

            return (
              <button
                key={method.code}
                type="button"
                disabled={isDisabled}
                onClick={() => {
                  selectMethod(method.code);
                  onClose();
                }}
                className={cn(
                  "app-pressable flex w-full items-center justify-between rounded-2xl border-2 p-4",
                  isSelected
                    ? "border-apois-yellow bg-zinc-800"
                    : "border-transparent bg-zinc-900/50",
                  isDisabled && "cursor-not-allowed opacity-40 grayscale",
                )}
              >
                <div className="flex min-w-0 items-center gap-4">
                  <div
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
                      isSelected ? "bg-apois-yellow text-black" : "bg-zinc-800 text-zinc-400",
                    )}
                  >
                    <Icon size={24} />
                  </div>
                  <div className="min-w-0 text-left">
                    <h4 className="truncate text-sm font-bold text-white">
                      {method.name || method.label}
                    </h4>
                    <p className="mt-0.5 text-[11px] font-medium leading-4 text-zinc-500">
                      {method.description}
                    </p>
                    {isWallet && wallet ? (
                      <p className="mt-0.5 text-[11px] font-bold text-emerald-500">
                        Saldo disponível: {PRICING_CONFIG.CURRENCY_FORMAT.format(wallet.available_balance)}
                      </p>
                    ) : null}
                  </div>
                </div>
                {isSelected ? <Check size={20} className="shrink-0 text-apois-yellow" /> : null}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function PaymentStatusMessage({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-5 text-zinc-500">{children}</p>;
}
