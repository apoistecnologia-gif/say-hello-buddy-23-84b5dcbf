import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ClipboardCopy,
  Clock3,
  CreditCard,
  ExternalLink,
  Loader2,
  LockKeyhole,
  QrCode,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useWallet } from "@/hooks/use-wallet";
import { supabase } from "@/integrations/supabase/client";
import { walletService } from "@/services/wallet/wallet-service";
import type {
  CancellationFee,
  CancellationFeePixCharge,
} from "@/types/payments";
import { formatCurrency } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/carteira")({
  component: CarteiraPage,
});

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function CarteiraPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { wallet, state, isLoading: isWalletLoading, refresh: refreshWallet } = useWallet();
  const [fees, setFees] = useState<CancellationFee[]>([]);
  const [isFeesLoading, setIsFeesLoading] = useState(true);
  const [feesError, setFeesError] = useState<string | null>(null);
  const [charge, setCharge] = useState<CancellationFeePixCharge | null>(null);
  const [chargingFeeId, setChargingFeeId] = useState<string | null>(null);

  const loadFees = useCallback(async () => {
    if (!profile?.id) return;
    setIsFeesLoading(true);
    setFeesError(null);
    try {
      setFees(await walletService.getPendingFees(profile.id));
    } catch (caughtError: unknown) {
      console.error("[CarteiraPage] Fees load failed", caughtError);
      setFeesError("Não foi possível carregar suas pendências.");
    } finally {
      setIsFeesLoading(false);
    }
  }, [profile?.id]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshWallet(), loadFees()]);
  }, [loadFees, refreshWallet]);

  useEffect(() => {
    void loadFees();
  }, [loadFees]);

  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`wallet-page:${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cancellation_fees",
          filter: `passenger_id=eq.${profile.id}`,
        },
        () => void refreshAll(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile?.id, refreshAll]);

  const pendingTotal = useMemo(
    () => fees.reduce((total, fee) => total + fee.amount, 0),
    [fees],
  );

  const generatePix = async (fee: CancellationFee): Promise<void> => {
    if (chargingFeeId) return;
    setChargingFeeId(fee.id);
    try {
      setCharge(await walletService.createCancellationFeePix(fee.id));
    } catch (caughtError: unknown) {
      toast.error(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível gerar o Pix desta multa.",
      );
    } finally {
      setChargingFeeId(null);
    }
  };

  const copyPix = async (): Promise<void> => {
    if (!charge?.qrCode) return;
    try {
      await navigator.clipboard.writeText(charge.qrCode);
      toast.success("Código Pix copiado.");
    } catch {
      toast.error("Não foi possível copiar o código Pix.");
    }
  };

  const qrImageSource = charge?.qrCodeBase64
    ? charge.qrCodeBase64.startsWith("data:")
      ? charge.qrCodeBase64
      : `data:image/png;base64,${charge.qrCodeBase64}`
    : null;

  const isLoading = isWalletLoading || isFeesLoading;

  return (
    <div className="app-screen min-h-[100dvh] bg-black text-white">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/8 bg-black/92 px-5 pb-4 pt-safe-area-inset-top backdrop-blur-xl">
        <div className="pt-5">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-apois-yellow">
            Financeiro
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-[-0.04em]">Minha carteira</h1>
        </div>
        <button
          type="button"
          aria-label="Atualizar carteira"
          onClick={() => void refreshAll()}
          disabled={isLoading}
          className="app-pressable mt-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900 disabled:opacity-50"
        >
          <RefreshCw className={isLoading ? "animate-spin" : ""} size={18} />
        </button>
      </header>

      <main className="app-scroll space-y-5 px-5 pb-8 pt-5">
        <section className="relative overflow-hidden rounded-[32px] border border-apois-yellow/20 bg-gradient-to-br from-[#261d00] via-[#15120a] to-zinc-950 p-6 shadow-[0_24px_70px_rgba(255,184,0,0.08)]">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-apois-yellow/10 blur-3xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-apois-yellow/80">
                Saldo disponível
              </p>
              <p className="mt-3 text-4xl font-black tracking-[-0.06em] text-white">
                {state === "loading" ? "—" : formatCurrency(wallet?.available_balance ?? 0)}
              </p>
              <p className="mt-2 text-xs leading-5 text-zinc-400">
                Créditos da carteira podem ser usados quando essa forma de pagamento estiver disponível.
              </p>
            </div>
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-apois-yellow text-black shadow-lg shadow-apois-yellow/20">
              <WalletCards size={25} />
            </div>
          </div>

          <div className="relative mt-6 flex items-center justify-between border-t border-white/10 pt-4">
            <div className="flex items-center gap-2">
              {wallet?.isBlocked ? (
                <LockKeyhole className="text-red-400" size={16} />
              ) : (
                <ShieldCheck className="text-apois-success" size={16} />
              )}
              <span className="text-xs font-black text-zinc-300">
                {wallet?.isBlocked ? "Carteira bloqueada" : "Carteira regular"}
              </span>
            </div>
            <span className="text-[10px] font-bold text-zinc-600">
              Saldo total: {formatCurrency(wallet?.balance ?? 0)}
            </span>
          </div>
        </section>

        {wallet?.isBlocked ? (
          <section className="rounded-3xl border border-red-500/20 bg-red-500/10 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 shrink-0 text-red-400" size={22} />
              <div>
                <h2 className="text-sm font-black text-red-200">Regularização necessária</h2>
                <p className="mt-2 text-xs leading-5 text-red-100/70">
                  {wallet.blockedReason ||
                    "Existe uma pendência financeira. Quite as multas abaixo para liberar novas solicitações."}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <section>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">
                Pendências
              </p>
              <h2 className="mt-1 text-lg font-black">Multas de cancelamento</h2>
            </div>
            {pendingTotal > 0 ? (
              <p className="text-sm font-black text-red-400">{formatCurrency(pendingTotal)}</p>
            ) : null}
          </div>

          {isFeesLoading ? (
            <div className="space-y-3">
              {[1, 2].map((item) => (
                <div key={item} className="h-36 animate-pulse rounded-3xl bg-zinc-900" />
              ))}
            </div>
          ) : feesError ? (
            <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-5 text-center">
              <p className="text-sm font-black text-white">Pendências indisponíveis</p>
              <p className="mt-2 text-xs text-red-200/70">{feesError}</p>
              <button
                type="button"
                onClick={() => void loadFees()}
                className="app-pressable mt-4 min-h-11 rounded-xl bg-white px-5 text-xs font-black text-black"
              >
                Tentar novamente
              </button>
            </div>
          ) : fees.length === 0 ? (
            <div className="rounded-3xl border border-apois-success/20 bg-apois-success/8 p-6 text-center">
              <CheckCircle2 className="mx-auto text-apois-success" size={36} />
              <h3 className="mt-3 text-base font-black">Nenhuma multa pendente</h3>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                Sua carteira não possui débitos de cancelamento em aberto.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {fees.map((fee) => (
                <article
                  key={fee.id}
                  className="rounded-3xl border border-white/8 bg-zinc-950 p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
                        <ReceiptText size={20} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-white">Multa de cancelamento</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">
                          {fee.reason}
                        </p>
                      </div>
                    </div>
                    <p className="shrink-0 text-lg font-black text-red-400">
                      {formatCurrency(fee.amount)}
                    </p>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-white/8 pt-4">
                    <p className="flex items-center gap-2 text-[10px] font-bold text-zinc-600">
                      <Clock3 size={13} />
                      {formatDate(fee.createdAt)}
                    </p>
                    {fee.rideId ? (
                      <button
                        type="button"
                        onClick={() =>
                          void navigate({
                            to: "/corridas/$rideId",
                            params: { rideId: fee.rideId as string },
                          })
                        }
                        className="app-pressable flex items-center gap-1 text-[10px] font-black text-zinc-400"
                      >
                        Ver corrida
                        <ChevronRight size={13} />
                      </button>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => void generatePix(fee)}
                    disabled={chargingFeeId !== null}
                    className="app-pressable mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-apois-yellow text-sm font-black text-black disabled:bg-zinc-800 disabled:text-zinc-500"
                  >
                    {chargingFeeId === fee.id ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : (
                      <QrCode size={18} />
                    )}
                    Pagar esta multa via Pix
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-white/8 bg-zinc-950 p-5">
          <div className="flex items-start gap-3">
            <CreditCard className="mt-0.5 shrink-0 text-apois-yellow" size={20} />
            <div>
              <h2 className="text-sm font-black">Liberação automática</h2>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                Após a confirmação do Pix pelo provedor, a multa é baixada automaticamente. Quando não houver outra pendência, a carteira é liberada sem precisar reabrir o aplicativo.
              </p>
            </div>
          </div>
        </section>
      </main>

      <Dialog open={charge !== null} onOpenChange={(open) => !open && setCharge(null)}>
        <DialogContent className="max-h-[90dvh] w-[calc(100vw-32px)] max-w-md overflow-y-auto rounded-3xl border-white/10 bg-zinc-950 p-0 text-white">
          {charge ? (
            <div>
              <DialogHeader className="border-b border-white/8 p-5 text-left">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-apois-yellow">
                      Pagamento seguro
                    </p>
                    <DialogTitle className="mt-1 text-xl font-black">Pix da multa</DialogTitle>
                  </div>
                  <button
                    type="button"
                    aria-label="Fechar cobrança Pix"
                    onClick={() => setCharge(null)}
                    className="app-pressable flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-900"
                  >
                    <X size={18} />
                  </button>
                </div>
              </DialogHeader>

              <div className="space-y-5 p-5">
                <div className="text-center">
                  <p className="text-xs font-bold text-zinc-500">Valor a pagar</p>
                  <p className="mt-1 text-3xl font-black text-white">
                    {formatCurrency(charge.amount)}
                  </p>
                </div>

                {qrImageSource ? (
                  <div className="mx-auto w-fit rounded-3xl bg-white p-4">
                    <img
                      src={qrImageSource}
                      alt="QR Code Pix da multa"
                      className="h-56 w-56 object-contain"
                    />
                  </div>
                ) : (
                  <div className="mx-auto flex h-56 w-56 items-center justify-center rounded-3xl border border-white/10 bg-zinc-900">
                    <QrCode className="text-zinc-600" size={64} />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void copyPix()}
                  className="app-pressable flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-apois-yellow text-sm font-black text-black"
                >
                  <ClipboardCopy size={18} />
                  Copiar código Pix
                </button>

                {charge.ticketUrl ? (
                  <button
                    type="button"
                    onClick={() => window.open(charge.ticketUrl as string, "_blank", "noopener,noreferrer")}
                    className="app-pressable flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-zinc-900 text-xs font-black"
                  >
                    <ExternalLink size={16} />
                    Abrir página do pagamento
                  </button>
                ) : null}

                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                  <p className="text-xs leading-5 text-zinc-400">
                    O aplicativo acompanhará a confirmação automaticamente. O tempo de reconhecimento depende do provedor do pagamento.
                  </p>
                  {charge.expiresAt ? (
                    <p className="mt-2 text-[10px] font-black text-zinc-600">
                      Expira em {formatDate(charge.expiresAt)}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
