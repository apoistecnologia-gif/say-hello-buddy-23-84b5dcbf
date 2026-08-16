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
      <div
        className="flex min-h-[72px] w-full items-center justify-center rounded-2xl border border-white/5 bg-zinc-900/50"
        role="status"
        aria-live="polite"
        aria-label="Carregando formas de pagamento"
      >
        <Loader2 className="animate-spin text-apois-yellow" size={20} aria-hidden="true" />
      </div>
    );
  }

  if (error || methods.length === 0) {
    return (
      <section
        className="rounded-2xl border border-red-500/20 bg-red-500/8 p-4"
        role="alert"
        aria-live="assertive"
      >
        <div className="flex min-w-0 items-start gap-3">
          <AlertCircle className="mt-0.5 shrink-0 text-red-400" size={19} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-white">Pagamento indisponível</p>
            <p className="mt-1 break-words text-[10px] leading-4 text-red-200/70">
              {error ?? "Nenhuma forma de pagamento está ativa no momento."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="app-pressable mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 text-center text-xs font-black text-white"
        >
          <RefreshCw size={15} aria-hidden="true" />
          Carregar novamente
        </button>
      </section>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenList}
      aria-haspopup="dialog"
      className="app-pressable flex min-h-[72px] w-full min-w-0 items-center justify-between gap-3 rounded-2xl border border-white/5 bg-zinc-900/50 p-4 text-left"
    >
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400">
          <Icon size={20} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="mb-0.5 block text-[10px] font-black uppercase tracking-widest text-zinc-500">
            Forma de pagamento
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 break-words text-sm font-bold leading-5 text-white">
              {current?.name || current?.label || "Selecione o pagamento"}
            </span>
            {selectedMethod === "wallet" && wallet ? (
              <span className="max-w-full rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-500">
                {PRICING_CONFIG.CURRENCY_FORMAT.format(wallet.available_balance)}
              </span>
            ) : null}
          </span>
        </span>
      </span>
      <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-zinc-600" />
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
      onClick={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-method-title"
        className="app-dialog-content flex max-h-[min(86dvh,760px)] w-full max-w-lg flex-col rounded-t-[32px] border-t border-zinc-800 bg-black px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-5 shadow-2xl animate-in slide-in-from-bottom duration-300 sm:px-6 sm:pt-6"
      >
        <div className="mb-4 flex min-w-0 items-center justify-between gap-3 sm:mb-6">
          <h2 id="payment-method-title" className="min-w-0 break-words pr-1 text-xl font-black leading-6 text-white">
            Forma de pagamento
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar formas de pagamento"
            className="app-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-zinc-400"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="app-scroll mb-2 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pb-4 sm:mb-6">
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
                aria-pressed={isSelected}
                onClick={() => {
                  selectMethod(method.code);
                  onClose();
                }}
                className={cn(
                  "app-pressable flex min-h-[72px] w-full min-w-0 items-center justify-between gap-3 rounded-2xl border-2 p-3 text-left sm:p-4",
                  isSelected
                    ? "border-apois-yellow bg-zinc-800"
                    : "border-transparent bg-zinc-900/50",
                  isDisabled && "cursor-not-allowed opacity-40 grayscale",
                )}
              >
                <span className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                  <span
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12",
                      isSelected ? "bg-apois-yellow text-black" : "bg-zinc-800 text-zinc-400",
                    )}
                  >
                    <Icon size={23} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block break-words text-sm font-bold leading-5 text-white">
                      {method.name || method.label}
                    </span>
                    <span className="mt-0.5 block break-words text-[11px] font-medium leading-4 text-zinc-500">
                      {method.description}
                    </span>
                    {isWallet && wallet ? (
                      <span className="mt-1 block break-words text-[11px] font-bold leading-4 text-emerald-500">
                        Saldo disponível: {PRICING_CONFIG.CURRENCY_FORMAT.format(wallet.available_balance)}
                      </span>
                    ) : null}
                  </span>
                </span>
                {isSelected ? <Check size={20} aria-hidden="true" className="shrink-0 text-apois-yellow" /> : null}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function PaymentStatusMessage({ children }: { children: ReactNode }) {
  return <p className="break-words text-xs leading-5 text-zinc-500">{children}</p>;
}
