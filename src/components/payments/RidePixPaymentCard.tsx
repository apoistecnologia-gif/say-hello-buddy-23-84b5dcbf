import { useState } from "react";
import { Check, Copy, Loader2, QrCode, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface RidePixPaymentCardProps {
  rideId: string;
}

type PixCheckout = {
  ok?: boolean;
  reused?: boolean;
  paymentId?: string;
  amountCents?: number;
  status?: string;
  pixPayload?: string | null;
  pixQrCodeBase64?: string | null;
  pixExpirationAt?: string | null;
  error?: string;
  detail?: string;
};

function cpfDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 11);
}

function formatCpf(value: string): string {
  const digits = cpfDigits(value);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function isValidCpf(value: string): boolean {
  const cpf = cpfDigits(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

function readableError(code: string | undefined) {
  switch (code) {
    case "driver_asaas_account_not_ready":
      return "O recebimento Pix deste motorista ainda não foi liberado pelo provedor.";
    case "passenger_billing_identity_incomplete":
      return "Precisamos confirmar seu CPF de cobrança antes de gerar o Pix.";
    case "ride_settlement_not_found":
      return "O fechamento financeiro da corrida ainda está sendo processado. Tente novamente em instantes.";
    case "ride_already_paid":
      return "Esta corrida já consta como paga.";
    default:
      return "Não foi possível gerar o Pix agora. Tente novamente.";
  }
}

export function RidePixPaymentCard({ rideId }: RidePixPaymentCardProps) {
  const [checkout, setCheckout] = useState<PixCheckout | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsCpf, setNeedsCpf] = useState(false);
  const [cpf, setCpf] = useState("");
  const [savingCpf, setSavingCpf] = useState(false);

  const generate = async () => {
    if (loading || paid) return;
    setLoading(true);
    setError(null);
    try {
      // A Edge Function é idempotente por rideId: se a cobrança já existe,
      // devolve a cobrança real existente em vez de criar uma duplicata.
      const { data, error: invokeError } = await supabase.functions.invoke<PixCheckout>(
        "asaas-create-ride-pix",
        { body: { rideId } },
      );
      if (invokeError) throw invokeError;
      if (!data?.ok) {
        if (data?.error === "ride_already_paid") setPaid(true);
        if (data?.error === "passenger_billing_identity_incomplete") setNeedsCpf(true);
        setError(readableError(data?.error));
        return;
      }
      setNeedsCpf(false);
      setCheckout(data);
      if (["received", "confirmed"].includes(String(data.status ?? ""))) {
        setPaid(true);
        toast.success("Pagamento Pix confirmado.");
        return;
      }
      if (data.pixPayload) toast.success("Pix da corrida pronto para pagamento.");
    } catch (caughtError) {
      console.error("[RidePixPaymentCard] Pix generation failed", caughtError);
      setError("Não foi possível gerar ou consultar o Pix agora. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const saveBillingCpf = async () => {
    if (savingCpf) return;
    if (!isValidCpf(cpf)) {
      toast.error("Informe um CPF válido.");
      return;
    }
    setSavingCpf(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw authError ?? new Error("not_authenticated");
      const { error: updateError } = await supabase
        .from("users")
        .update({ cpf: cpfDigits(cpf), updated_at: new Date().toISOString() })
        .eq("auth_user_id", authData.user.id);
      if (updateError) throw updateError;
      setNeedsCpf(false);
      setError(null);
      toast.success("CPF de cobrança salvo com segurança.");
      await generate();
    } catch (caughtError) {
      console.error("[RidePixPaymentCard] billing CPF update failed", caughtError);
      toast.error("Não foi possível salvar o CPF agora.");
    } finally {
      setSavingCpf(false);
    }
  };

  const copy = async () => {
    if (!checkout?.pixPayload) return;
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
      <section className="rounded-3xl border border-emerald-400/25 bg-emerald-400/8 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-400">
            <Check size={22} strokeWidth={3} />
          </span>
          <div>
            <p className="text-sm font-black text-white">Pix confirmado</p>
            <p className="mt-1 text-[11px] text-zinc-400">O pagamento foi confirmado pelo fluxo oficial do Asaas.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-apois-yellow/25 bg-[#0e1014] p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-apois-yellow/10 text-apois-yellow">
          <QrCode size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-white">Pagamento por Pix</p>
          <p className="mt-1 text-[11px] leading-4 text-zinc-400">
            O Pix usa o valor real do fechamento da corrida e o processamento oficial do Asaas.
          </p>
        </div>
      </div>

      {needsCpf ? (
        <div className="mt-4 rounded-2xl border border-apois-yellow/20 bg-black/30 p-3">
          <label htmlFor={`ride-pix-cpf-${rideId}`} className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-500">
            CPF para cobrança Pix
          </label>
          <input
            id={`ride-pix-cpf-${rideId}`}
            inputMode="numeric"
            autoComplete="off"
            value={cpf}
            onChange={(event) => setCpf(formatCpf(event.target.value))}
            placeholder="000.000.000-00"
            className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#111318] px-4 text-sm font-bold text-white outline-none focus:border-apois-yellow/50"
          />
          <p className="mt-2 text-[10px] leading-4 text-zinc-500">Usado somente para identificar a cobrança no provedor de pagamento.</p>
          <button
            type="button"
            disabled={savingCpf}
            onClick={() => void saveBillingCpf()}
            className="app-pressable mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-apois-yellow text-xs font-black text-black disabled:opacity-60"
          >
            {savingCpf ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            {savingCpf ? "Salvando..." : "Salvar CPF e continuar"}
          </button>
        </div>
      ) : null}

      {checkout?.pixQrCodeBase64 ? (
        <div className="mx-auto mt-4 w-fit rounded-2xl bg-white p-3">
          <img
            src={`data:image/png;base64,${checkout.pixQrCodeBase64}`}
            alt="QR Code Pix da corrida APOIS"
            className="h-48 w-48"
          />
        </div>
      ) : null}

      {checkout?.pixPayload ? (
        <>
          <div className="mt-4 rounded-2xl border border-white/8 bg-black/35 p-3">
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-500">Pix copia e cola</p>
            <p className="mt-2 max-h-20 overflow-hidden break-all font-mono text-[10px] leading-4 text-zinc-300">
              {checkout.pixPayload}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void copy()}
            className="app-pressable mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-apois-yellow/30 bg-apois-yellow/8 text-xs font-black text-apois-yellow"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Código copiado" : "Copiar código Pix"}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void generate()}
            className="app-pressable mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] text-[11px] font-black text-zinc-300 disabled:opacity-60"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            Consultar pagamento
          </button>
        </>
      ) : !needsCpf ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => void generate()}
          className="app-pressable mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-apois-yellow text-sm font-black text-black disabled:opacity-60"
        >
          {loading ? <Loader2 size={17} className="animate-spin" /> : <QrCode size={17} />}
          {loading ? "Consultando Pix..." : "Gerar / consultar Pix da corrida"}
        </button>
      ) : null}

      {error ? (
        <div className="mt-3 flex items-start justify-between gap-3 rounded-2xl border border-red-400/20 bg-red-400/8 p-3">
          <p className="text-[11px] leading-4 text-red-300">{error}</p>
          {!needsCpf ? (
            <button type="button" onClick={() => void generate()} className="shrink-0 text-apois-yellow" aria-label="Tentar gerar Pix novamente">
              <RefreshCw size={16} />
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
