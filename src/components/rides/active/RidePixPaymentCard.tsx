import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, Loader2, QrCode, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ridePixPaymentService,
  type RidePixCharge,
} from "@/services/payments/ride-pix-payment-service";

interface RidePixPaymentCardProps {
  rideId: string;
  provider: string | null;
  onPaid?: () => void | Promise<void>;
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (normalized.includes("passenger_billing_identity_incomplete")) {
    return "Complete seu nome e CPF no perfil para gerar o PIX da corrida.";
  }
  if (normalized.includes("provider_unavailable") || normalized.includes("not_configured")) {
    return "O pagamento PIX está temporariamente indisponível. Escolha outra forma de pagamento ou tente mais tarde.";
  }
  if (normalized.includes("ride_not_awaiting_pix_payment")) {
    return "O pagamento desta corrida já mudou de estado. Atualize a corrida.";
  }
  if (normalized.includes("amount_mismatch")) {
    return "O provedor retornou um valor diferente do valor da corrida. Nenhuma confirmação foi aplicada.";
  }
  return "Não foi possível carregar o PIX agora. Tente novamente.";
}

function qrSource(value: string | null): string | null {
  if (!value) return null;
  return value.startsWith("data:image/") ? value : `data:image/png;base64,${value}`;
}

function expirationLabel(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function RidePixPaymentCard({ rideId, provider, onPaid }: RidePixPaymentCardProps) {
  const [charge, setCharge] = useState<RidePixCharge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const paidNotifiedRef = useRef(false);

  const recover = useCallback(async () => {
    try {
      const next = await ridePixPaymentService.recoverOrCreate(rideId, provider);
      setCharge(next);
      setError(null);
      if (next.paid && !paidNotifiedRef.current) {
        paidNotifiedRef.current = true;
        toast.success("PIX confirmado. Buscando motorista.");
        await onPaid?.();
      }
    } catch (caughtError: unknown) {
      setError(friendlyError(caughtError));
    } finally {
      setLoading(false);
    }
  }, [onPaid, provider, rideId]);

  useEffect(() => {
    paidNotifiedRef.current = false;
    setCharge(null);
    setError(null);
    setLoading(true);
    void recover();
  }, [recover, rideId]);

  useEffect(() => {
    if (charge?.paid || charge?.status === "expired") return;
    const timer = window.setInterval(() => void recover(), 4_000);
    return () => window.clearInterval(timer);
  }, [charge?.paid, charge?.status, recover]);

  const retry = async (): Promise<void> => {
    if (retrying) return;
    setRetrying(true);
    try {
      const next = await ridePixPaymentService.retry(rideId, provider);
      paidNotifiedRef.current = false;
      setCharge(next);
      setError(null);
      if (next.paid) {
        paidNotifiedRef.current = true;
        toast.success("PIX confirmado. Buscando motorista.");
        await onPaid?.();
      }
    } catch (caughtError: unknown) {
      setError(friendlyError(caughtError));
    } finally {
      setRetrying(false);
    }
  };

  const copyPayload = async (): Promise<void> => {
    if (!charge?.pixPayload) return;
    try {
      await navigator.clipboard.writeText(charge.pixPayload);
      toast.success("Código PIX copiado.");
    } catch {
      toast.error("Não foi possível copiar o código PIX.");
    }
  };

  if (charge?.paid) {
    return (
      <div className="rounded-2xl border border-green-500/20 bg-green-500/10 p-5 text-center">
        <CheckCircle2 className="mx-auto text-green-400" size={32} />
        <p className="mt-3 text-sm font-black text-white">Pagamento confirmado</p>
        <p className="mt-1 text-[11px] leading-5 text-zinc-400">
          A corrida foi liberada para a busca de motorista.
        </p>
      </div>
    );
  }

  if (loading && !charge) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-apois-yellow/20 bg-apois-yellow/10 p-4">
        <Loader2 className="shrink-0 animate-spin text-apois-yellow" size={22} />
        <div>
          <p className="text-sm font-black text-white">Gerando seu PIX</p>
          <p className="mt-1 text-[11px] text-zinc-400">Aguarde a cobrança segura do provedor.</p>
        </div>
      </div>
    );
  }

  if (charge?.status === "expired") {
    return (
      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-5 text-center">
        <RefreshCw className="mx-auto text-amber-300" size={28} />
        <p className="mt-3 text-sm font-black text-white">Este PIX expirou</p>
        <p className="mt-1 text-[11px] leading-5 text-zinc-400">
          Gere uma nova cobrança para continuar com a corrida.
        </p>
        <Button
          type="button"
          onClick={() => void retry()}
          disabled={retrying}
          className="mt-4 h-12 w-full rounded-2xl bg-apois-yellow font-black text-black"
        >
          {retrying ? <Loader2 className="mr-2 animate-spin" size={17} /> : null}
          Gerar novo PIX
        </Button>
      </div>
    );
  }

  const image = qrSource(charge?.pixQrCodeBase64 ?? null);
  const expires = expirationLabel(charge?.pixExpirationAt ?? null);

  return (
    <div className="rounded-3xl border border-apois-yellow/20 bg-zinc-900/70 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-apois-yellow/10">
          <QrCode className="text-apois-yellow" size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-white">Pague o PIX para buscar motorista</p>
          <p className="mt-1 text-[11px] leading-5 text-zinc-400">
            O despacho só começa depois da confirmação real do provedor.
          </p>
        </div>
        {charge ? (
          <span className="shrink-0 text-sm font-black text-apois-yellow">
            {(charge.amountCents / 100).toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}
          </span>
        ) : null}
      </div>

      {image ? (
        <div className="mx-auto mt-5 w-fit rounded-2xl bg-white p-3">
          <img src={image} alt="QR Code PIX da corrida" className="h-48 w-48 object-contain" />
        </div>
      ) : null}

      {charge?.pixPayload ? (
        <Button
          type="button"
          onClick={() => void copyPayload()}
          className="mt-5 h-12 w-full rounded-2xl bg-apois-yellow font-black text-black"
        >
          <Copy className="mr-2" size={17} />
          Copiar código PIX
        </Button>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-3 text-[10px] font-medium text-zinc-500">
        <span>{expires ? `Válido até ${expires}` : "Aguardando dados da cobrança"}</span>
        <button
          type="button"
          onClick={() => void recover()}
          className="flex items-center gap-1 text-zinc-400"
        >
          <RefreshCw size={12} /> Atualizar
        </button>
      </div>

      {error ? <p className="mt-3 text-[11px] font-semibold leading-5 text-red-400">{error}</p> : null}
    </div>
  );
}
