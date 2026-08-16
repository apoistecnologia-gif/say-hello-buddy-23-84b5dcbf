import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Loader2, QrCode, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface RidePixPaymentCardProps {
  rideId: string;
  officialAmount?: number;
}

type PixCheckout = {
  ok?: boolean;
  reused?: boolean;
  legacy?: boolean;
  pending?: boolean;
  reconciliationRequired?: boolean;
  provider?: "asaas" | "pagbank" | "woovi" | string;
  paymentId?: string;
  amountCents?: number;
  fareCents?: number;
  processingFeeCents?: number;
  passengerChargeCents?: number;
  legacyFinancialSnapshot?: boolean;
  paid?: boolean;
  status?: string;
  pixPayload?: string | null;
  pixQrCodeBase64?: string | null;
  pixExpirationAt?: string | null;
  error?: string;
};

function readableError(code: string | undefined) {
  switch (code) {
    case "ride_already_paid":
      return "O pagamento desta corrida já foi confirmado.";
    case "ride_not_awaiting_pix_payment":
      return "Esta corrida já avançou para a próxima etapa.";
    case "ride_not_found":
      return "Não foi possível localizar esta corrida para cobrança.";
    case "payment_provider_not_configured":
    case "asaas_not_configured":
    case "pagbank_not_configured":
      return "O Pix está temporariamente indisponível. Tente novamente em instantes.";
    case "payment_provider_not_supported":
    case "ride_payment_provider_mismatch":
      return "O Pix desta corrida está temporariamente indisponível. Tente novamente em instantes.";
    case "payment_amount_mismatch":
      return "O valor do Pix não confere com o total oficial da corrida. Nenhuma cobrança foi liberada.";
    case "legacy_asaas_charge_active":
      return "Esta corrida ainda possui um Pix anterior ativo. Consulte o pagamento existente antes de gerar uma nova cobrança.";
    default:
      return "Não foi possível gerar ou consultar o Pix agora. Tente novamente.";
  }
}

function normalizePaymentStatus(value: string | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function isBackendPaidStatus(value: string | undefined): boolean {
  return ["received", "paid"].includes(normalizePaymentStatus(value));
}

function validCents(value: number | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatExpiration(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function providerLabel(provider: string | null | undefined): string | null {
  const normalized = String(provider ?? "").trim().toLowerCase();
  if (normalized === "asaas") return "Asaas";
  if (normalized === "pagbank") return "PagBank";
  if (normalized === "woovi" || normalized === "openpix") return "Woovi";
  return normalized ? "parceiro de pagamentos" : null;
}

export function RidePixPaymentCard({ rideId, officialAmount }: RidePixPaymentCardProps) {
  const normalizedRideId = rideId.trim();
  const [checkout, setCheckout] = useState<PixCheckout | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [qrFailed, setQrFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const autoLoadedRideRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);
  const inFlightRef = useRef(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setCheckout(null);
    setPaid(false);
    setError(null);
    setCopyError(null);
    setCopied(false);
    setQrFailed(false);
    setNow(Date.now());
    autoLoadedRideRef.current = null;
    requestIdRef.current += 1;
    inFlightRef.current = false;
  }, [normalizedRideId]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      requestIdRef.current += 1;
    };
  }, []);

  const status = normalizePaymentStatus(checkout?.status);
  const pixPayload = checkout?.pixPayload?.trim() || "";
  const qrCodeBase64 = checkout?.pixQrCodeBase64?.trim() || "";

  const expired = useMemo(() => {
    if (["expired", "overdue"].includes(status)) return true;
    if (!checkout?.pixExpirationAt) return false;
    const expiration = Date.parse(checkout.pixExpirationAt);
    return Number.isFinite(expiration) && expiration <= now;
  }, [checkout?.pixExpirationAt, now, status]);

  const fareAmount = validCents(checkout?.fareCents)
    ? checkout.fareCents / 100
    : validAmount(officialAmount)
      ? officialAmount
      : null;
  const processingFeeAmount = validCents(checkout?.processingFeeCents) ? checkout.processingFeeCents / 100 : null;
  const passengerChargeAmount = validCents(checkout?.passengerChargeCents)
    ? checkout.passengerChargeCents / 100
    : validCents(checkout?.amountCents)
      ? checkout.amountCents / 100
      : null;
  const expirationLabel = formatExpiration(checkout?.pixExpirationAt);
  const providerConfirmed = status === "confirmed";
  const reconciliationPending = checkout?.reconciliationRequired === true || checkout?.pending === true;
  const checkoutProviderLabel = providerLabel(checkout?.provider);
  const hasUsablePix = Boolean(pixPayload) && !expired;
  const hasUsableQr = Boolean(qrCodeBase64) && !qrFailed && !expired;

  const generate = useCallback(
    async (action: "recover" | "retry" = "recover") => {
      if (inFlightRef.current || loading || paid) return;
      if (!normalizedRideId) {
        setError("Não foi possível identificar esta corrida para gerar o Pix.");
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      inFlightRef.current = true;
      setLoading(true);
      setError(null);
      setCopyError(null);
      if (action === "retry") {
        setCheckout(null);
        setQrFailed(false);
      }

      try {
        const { data, error: invokeError } = await supabase.functions.invoke<PixCheckout>(
          "ride-pix-checkout",
          { body: { rideId: normalizedRideId, action } },
        );
        if (requestId !== requestIdRef.current) return;
        if (invokeError) throw invokeError;
        if (!data?.ok) {
          if (data?.error === "ride_already_paid") {
            setPaid(true);
            setCheckout(null);
            return;
          }
          setError(readableError(data?.error));
          return;
        }

        if (
          validCents(data.passengerChargeCents) &&
          validCents(data.amountCents) &&
          data.passengerChargeCents !== data.amountCents
        ) {
          console.error("[RidePixPaymentCard] backend amount mismatch", data);
          setCheckout(null);
          setError(readableError("payment_amount_mismatch"));
          return;
        }

        const normalizedData: PixCheckout = {
          ...data,
          pixPayload: data.pixPayload?.trim() || null,
          pixQrCodeBase64: data.pixQrCodeBase64?.trim() || null,
        };
        setCheckout(normalizedData);
        setQrFailed(false);

        if (normalizedData.paid === true || isBackendPaidStatus(normalizedData.status)) {
          setPaid(true);
          toast.success("Pagamento Pix confirmado.");
          return;
        }

        const normalizedStatus = normalizePaymentStatus(normalizedData.status);
        if (normalizedData.pixPayload && !["expired", "overdue"].includes(normalizedStatus)) {
          toast.success(normalizedData.reused ? "Pix pendente recuperado." : "Pix pronto para pagamento.");
          return;
        }

        if (!normalizedData.pending && !normalizedData.reconciliationRequired && normalizedStatus !== "confirmed") {
          setError("O Pix ainda não ficou disponível. Tente consultar novamente em instantes.");
        }
      } catch (caughtError) {
        if (requestId !== requestIdRef.current) return;
        console.error("[RidePixPaymentCard] Pix lookup failed", caughtError);
        setError("Não foi possível gerar ou consultar o Pix agora. Tente novamente.");
      } finally {
        if (requestId === requestIdRef.current) {
          inFlightRef.current = false;
          setLoading(false);
        }
      }
    },
    [loading, normalizedRideId, paid],
  );

  useEffect(() => {
    if (!normalizedRideId || autoLoadedRideRef.current === normalizedRideId) return;
    autoLoadedRideRef.current = normalizedRideId;
    void generate("recover");
  }, [generate, normalizedRideId]);

  const copy = async () => {
    if (!pixPayload || expired || loading) return;
    setCopyError(null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(pixPayload);
      setCopied(true);
      toast.success("Código Pix copiado.");
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copyTimerRef.current = null;
      }, 1_600);
    } catch {
      setCopyError("Não foi possível copiar automaticamente. Toque e segure o código para copiar manualmente.");
      toast.error("Não foi possível copiar o código Pix.");
    }
  };

  if (paid) {
    return (
      <section className="min-w-0 rounded-3xl border border-emerald-400/25 bg-emerald-400/8 p-4" role="status" aria-live="polite">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-400">
            <Check size={22} strokeWidth={3} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-black text-white">Pix confirmado</p>
            <p className="mt-1 break-words text-xs leading-5 text-zinc-400">O pagamento foi confirmado. A busca de motorista pode começar.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="min-w-0 rounded-3xl border border-apois-yellow/25 bg-[#0e1014] p-4" aria-busy={loading} aria-label="Pagamento Pix da corrida">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-apois-yellow/10 text-apois-yellow">
          <QrCode size={22} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-black leading-5 text-white">Pague por Pix para chamar o motorista</p>
          <p className="mt-1 break-words text-xs leading-5 text-zinc-400">A corrida só entra na busca depois que o pagamento for confirmado com segurança.</p>
          {checkoutProviderLabel ? <p className="mt-1 break-words text-xs leading-5 text-zinc-500">Cobrança processada por {checkoutProviderLabel}.</p> : null}
        </div>
      </div>

      {fareAmount !== null ? (
        <div className="mt-4 min-w-0 rounded-2xl border border-white/8 bg-black/35 p-3">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs"><span className="break-words text-zinc-400">Valor da corrida</span><span className="max-w-full break-words font-black tabular-nums text-white">{formatCurrency(fareAmount)}</span></div>
          {processingFeeAmount !== null ? <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs"><span className="break-words text-zinc-400">Taxa de processamento</span><span className="max-w-full break-words font-black tabular-nums text-white">{formatCurrency(processingFeeAmount)}</span></div> : <p className="mt-2 break-words text-xs leading-5 text-zinc-500">A taxa de processamento e o total são conferidos antes da geração do Pix.</p>}
          {passengerChargeAmount !== null ? <div className="mt-3 flex min-w-0 flex-wrap items-end justify-between gap-x-3 gap-y-1 border-t border-white/8 pt-3"><span className="break-words text-xs font-black uppercase tracking-[0.12em] text-zinc-500">Total do Pix</span><span className="max-w-full break-words text-[clamp(20px,7vw,24px)] font-black tabular-nums text-apois-yellow">{formatCurrency(passengerChargeAmount)}</span></div> : null}
        </div>
      ) : null}

      {providerConfirmed ? <div className="mt-4 min-w-0 rounded-2xl border border-amber-400/20 bg-amber-400/8 p-3" role="status" aria-live="polite"><p className="break-words text-sm font-black text-amber-200">Pagamento identificado</p><p className="mt-1 break-words text-xs leading-5 text-zinc-400">O pagamento foi identificado e está passando pela confirmação final antes de liberar a corrida.</p></div> : null}
      {reconciliationPending && !pixPayload && !providerConfirmed ? <div className="mt-4 min-w-0 rounded-2xl border border-sky-400/20 bg-sky-400/8 p-3" role="status" aria-live="polite"><p className="break-words text-sm font-black text-sky-200">Recuperando cobrança Pix</p><p className="mt-1 break-words text-xs leading-5 text-zinc-400">Estamos recuperando a cobrança existente para evitar dois Pix ativos para a mesma corrida.</p></div> : null}

      {hasUsableQr ? (
        <div className="mx-auto mt-4 w-fit max-w-full rounded-2xl bg-white p-3">
          <img
            src={`data:image/png;base64,${qrCodeBase64}`}
            alt="QR Code Pix da corrida APOIS"
            className="h-auto w-48 max-w-full"
            onError={() => setQrFailed(true)}
          />
        </div>
      ) : null}
      {qrFailed && hasUsablePix ? <p className="mt-3 break-words text-center text-xs leading-5 text-zinc-500" role="status">O QR Code não pôde ser exibido. Use o Pix copia e cola abaixo.</p> : null}

      {hasUsablePix ? (
        <>
          {expirationLabel ? <p className="mt-3 break-words text-center text-xs font-bold text-zinc-400">Válido até {expirationLabel}</p> : null}
          <div className="mt-3 min-w-0 rounded-2xl border border-white/8 bg-black/35 p-3">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-zinc-500">Pix copia e cola</p>
            <p className="mt-2 max-h-28 max-w-full overflow-y-auto break-all font-mono text-xs leading-5 text-zinc-300" tabIndex={0}>{pixPayload}</p>
          </div>
          <button type="button" onClick={() => void copy()} disabled={loading} className="app-pressable mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-apois-yellow/30 bg-apois-yellow/8 px-3 text-center text-xs font-black text-apois-yellow disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apois-yellow">
            {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            {copied ? "Código copiado" : "Copiar código Pix"}
          </button>
          {copyError ? <p className="mt-2 break-words text-xs leading-5 text-amber-300" role="alert">{copyError}</p> : null}
          <button type="button" disabled={loading} aria-busy={loading} onClick={() => void generate("recover")} className="app-pressable mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 text-center text-xs font-black text-zinc-300 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apois-yellow">
            {loading ? <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
            {loading ? "Consultando pagamento..." : "Consultar pagamento"}
          </button>
        </>
      ) : null}

      {expired ? <div className="mt-4 min-w-0 rounded-2xl border border-amber-400/20 bg-amber-400/8 p-3" role="alert"><p className="break-words text-sm font-black text-amber-300">Pix expirado</p><p className="mt-1 break-words text-xs leading-5 text-zinc-400">A corrida continua aguardando pagamento. Gere um novo Pix para continuar.</p><button type="button" disabled={loading} aria-busy={loading} onClick={() => void generate("retry")} className="app-pressable mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-apois-yellow px-3 text-center text-xs font-black text-black disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">{loading ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}{loading ? "Gerando novo Pix..." : "Gerar novo Pix"}</button></div> : null}
      {!pixPayload && !expired && !error ? <button type="button" disabled={loading || !normalizedRideId} aria-busy={loading} onClick={() => void generate("recover")} className="app-pressable mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-apois-yellow px-3 text-center text-sm font-black text-black disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">{loading ? <Loader2 size={17} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <QrCode size={17} aria-hidden="true" />}{loading ? "Consultando Pix..." : "Gerar / recuperar Pix"}</button> : null}
      {error ? <div className="mt-3 flex min-w-0 items-start gap-3 rounded-2xl border border-red-400/20 bg-red-400/8 p-3" role="alert" aria-live="assertive"><p className="min-w-0 flex-1 break-words text-xs leading-5 text-red-300">{error}</p><button type="button" disabled={loading || !normalizedRideId} aria-busy={loading} onClick={() => void generate("recover")} className="app-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-apois-yellow disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apois-yellow" aria-label={loading ? "Consultando Pix novamente" : "Tentar consultar Pix novamente"}><RefreshCw size={16} className={loading ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden="true" /></button></div> : null}
    </section>
  );
}
