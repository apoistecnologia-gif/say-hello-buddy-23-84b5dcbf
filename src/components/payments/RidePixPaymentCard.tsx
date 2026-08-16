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
  const [checkout, setCheckout] = useState<PixCheckout | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoLoadedRideRef = useRef<string | null>(null);

  const expired = useMemo(() => {
    const status = normalizePaymentStatus(checkout?.status);
    if (["expired", "overdue"].includes(status)) return true;
    if (!checkout?.pixExpirationAt) return false;
    const expiration = Date.parse(checkout.pixExpirationAt);
    return Number.isFinite(expiration) && expiration <= Date.now();
  }, [checkout?.pixExpirationAt, checkout?.status]);

  const fareAmount = validCents(checkout?.fareCents) ? checkout.fareCents / 100 : officialAmount;
  const processingFeeAmount = validCents(checkout?.processingFeeCents) ? checkout.processingFeeCents / 100 : null;
  const passengerChargeAmount = validCents(checkout?.passengerChargeCents)
    ? checkout.passengerChargeCents / 100
    : validCents(checkout?.amountCents)
      ? checkout.amountCents / 100
      : null;
  const expirationLabel = formatExpiration(checkout?.pixExpirationAt);
  const providerConfirmed = normalizePaymentStatus(checkout?.status) === "confirmed";
  const reconciliationPending = checkout?.reconciliationRequired === true || checkout?.pending === true;
  const checkoutProviderLabel = providerLabel(checkout?.provider);

  const generate = useCallback(async (action: "recover" | "retry" = "recover") => {
    if (loading || paid) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke<PixCheckout>(
        "ride-pix-checkout",
        { body: { rideId, action } },
      );
      if (invokeError) throw invokeError;
      if (!data?.ok) {
        if (data?.error === "ride_already_paid") setPaid(true);
        setError(readableError(data?.error));
        return;
      }

      if (
        validCents(data.passengerChargeCents) &&
        validCents(data.amountCents) &&
        data.passengerChargeCents !== data.amountCents
      ) {
        console.error("[RidePixPaymentCard] backend amount mismatch", data);
        setError(readableError("payment_amount_mismatch"));
        return;
      }

      setCheckout(data);
      if (data.paid === true || isBackendPaidStatus(data.status)) {
        setPaid(true);
        toast.success("Pagamento Pix confirmado.");
        return;
      }
      if (data.pixPayload && !["expired", "overdue"].includes(normalizePaymentStatus(data.status))) {
        toast.success(data.reused ? "Pix pendente recuperado." : "Pix pronto para pagamento.");
      }
    } catch (caughtError) {
      console.error("[RidePixPaymentCard] Pix lookup failed", caughtError);
      setError("Não foi possível gerar ou consultar o Pix agora. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, [loading, paid, rideId]);

  useEffect(() => {
    if (autoLoadedRideRef.current === rideId) return;
    autoLoadedRideRef.current = rideId;
    void generate("recover");
  }, [generate, rideId]);

  const copy = async () => {
    if (!checkout?.pixPayload || expired) return;
    try {
      await navigator.clipboard.writeText(checkout.pixPayload);
      setCopied(true);
      toast.success("Código Pix copiado.");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Não foi possível copiar o código Pix.");
    }
  };

  if (paid) {
    return (
      <section className="min-w-0 rounded-3xl border border-emerald-400/25 bg-emerald-400/8 p-4" role="status" aria-live="polite">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-400"><Check size={22} strokeWidth={3} aria-hidden="true" /></span>
          <div className="min-w-0 flex-1"><p className="break-words text-sm font-black text-white">Pix confirmado</p><p className="mt-1 break-words text-[11px] leading-4 text-zinc-400">O pagamento foi confirmado. A busca de motorista pode começar.</p></div>
        </div>
      </section>
    );
  }

  return (
    <section className="min-w-0 rounded-3xl border border-apois-yellow/25 bg-[#0e1014] p-4" aria-busy={loading}>
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-apois-yellow/10 text-apois-yellow"><QrCode size={22} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1"><p className="break-words text-sm font-black leading-5 text-white">Pague por Pix para chamar o motorista</p><p className="mt-1 break-words text-[11px] leading-4 text-zinc-400">A corrida só entra na busca depois que o pagamento for confirmado com segurança.</p>{checkoutProviderLabel ? <p className="mt-1 break-words text-[10px] leading-4 text-zinc-500">Cobrança processada por {checkoutProviderLabel}.</p> : null}</div>
      </div>

      {typeof fareAmount === "number" && Number.isFinite(fareAmount) ? (
        <div className="mt-4 min-w-0 rounded-2xl border border-white/8 bg-black/35 p-3">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px]"><span className="break-words text-zinc-400">Valor da corrida</span><span className="max-w-full break-words font-black tabular-nums text-white">{formatCurrency(fareAmount)}</span></div>
          {processingFeeAmount !== null ? <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px]"><span className="break-words text-zinc-400">Taxa de processamento</span><span className="max-w-full break-words font-black tabular-nums text-white">{formatCurrency(processingFeeAmount)}</span></div> : <p className="mt-2 break-words text-[10px] leading-4 text-zinc-500">A taxa de processamento e o total são validados antes da geração do Pix.</p>}
          {passengerChargeAmount !== null ? <div className="mt-3 flex min-w-0 flex-wrap items-end justify-between gap-x-3 gap-y-1 border-t border-white/8 pt-3"><span className="break-words text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Total do Pix</span><span className="max-w-full break-words text-[clamp(20px,7vw,24px)] font-black tabular-nums text-apois-yellow">{formatCurrency(passengerChargeAmount)}</span></div> : null}
        </div>
      ) : null}

      {providerConfirmed ? <div className="mt-4 min-w-0 rounded-2xl border border-amber-400/20 bg-amber-400/8 p-3" role="status" aria-live="polite"><p className="break-words text-sm font-black text-amber-200">Pagamento identificado</p><p className="mt-1 break-words text-[11px] leading-4 text-zinc-400">O pagamento foi identificado e está passando pela confirmação final antes de liberar a corrida.</p></div> : null}
      {reconciliationPending && !checkout?.pixPayload && !providerConfirmed ? <div className="mt-4 min-w-0 rounded-2xl border border-sky-400/20 bg-sky-400/8 p-3" role="status" aria-live="polite"><p className="break-words text-sm font-black text-sky-200">Recuperando cobrança Pix</p><p className="mt-1 break-words text-[11px] leading-4 text-zinc-400">Estamos recuperando a cobrança existente para evitar dois Pix ativos para a mesma corrida.</p></div> : null}

      {checkout?.pixQrCodeBase64 && !expired ? <div className="mx-auto mt-4 w-fit max-w-full rounded-2xl bg-white p-3"><img src={`data:image/png;base64,${checkout.pixQrCodeBase64}`} alt="QR Code Pix da corrida APOIS" className="h-auto w-48 max-w-full" /></div> : null}

      {checkout?.pixPayload && !expired ? <>{expirationLabel ? <p className="mt-3 break-words text-center text-[10px] font-bold text-zinc-400">Válido até {expirationLabel}</p> : null}<div className="mt-3 min-w-0 rounded-2xl border border-white/8 bg-black/35 p-3"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Pix copia e cola</p><p className="mt-2 max-h-24 max-w-full overflow-y-auto break-all font-mono text-[10px] leading-4 text-zinc-300">{checkout.pixPayload}</p></div><button type="button" onClick={() => void copy()} className="app-pressable mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-apois-yellow/30 bg-apois-yellow/8 px-3 text-center text-xs font-black text-apois-yellow">{copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}{copied ? "Código copiado" : "Copiar código Pix"}</button><button type="button" disabled={loading} aria-busy={loading} onClick={() => void generate("recover")} className="app-pressable mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 text-center text-[11px] font-black text-zinc-300 disabled:opacity-60">{loading ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}Consultar pagamento</button></> : null}

      {expired ? <div className="mt-4 min-w-0 rounded-2xl border border-amber-400/20 bg-amber-400/8 p-3" role="alert"><p className="break-words text-sm font-black text-amber-300">Pix expirado</p><p className="mt-1 break-words text-[11px] leading-4 text-zinc-400">A corrida continua aguardando pagamento. Gere um novo Pix para continuar.</p><button type="button" disabled={loading} aria-busy={loading} onClick={() => void generate("retry")} className="app-pressable mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-apois-yellow px-3 text-center text-xs font-black text-black disabled:opacity-60">{loading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}Gerar novo Pix</button></div> : null}
      {!checkout?.pixPayload && !expired ? <button type="button" disabled={loading} aria-busy={loading} onClick={() => void generate("recover")} className="app-pressable mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-apois-yellow px-3 text-center text-sm font-black text-black disabled:opacity-60">{loading ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <QrCode size={17} aria-hidden="true" />}{loading ? "Consultando Pix..." : "Gerar / recuperar Pix"}</button> : null}
      {error ? <div className="mt-3 flex min-w-0 items-start gap-3 rounded-2xl border border-red-400/20 bg-red-400/8 p-3" role="alert" aria-live="assertive"><p className="min-w-0 flex-1 break-words text-[11px] leading-4 text-red-300">{error}</p><button type="button" onClick={() => void generate("recover")} className="app-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-apois-yellow" aria-label="Tentar consultar Pix novamente"><RefreshCw size={16} aria-hidden="true" /></button></div> : null}
    </section>
  );
}
