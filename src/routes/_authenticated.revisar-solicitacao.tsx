import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useRef } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Clock3,
  Info,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { useCancellationPolicy } from "@/hooks/rides/use-cancellation-policy";
import { useActiveRide } from "@/hooks/rides/use-active-ride";
import { useRideRequest } from "@/hooks/rides/use-ride-request";
import { useCheckoutPreparation } from "@/hooks/use-checkout-preparation";
import { useDestination } from "@/hooks/use-destination";
import { usePaymentMethods } from "@/hooks/use-payment-methods";
import { usePickupAddress } from "@/hooks/use-pickup-address";
import { usePricing } from "@/hooks/use-pricing";
import { useRideCategories } from "@/hooks/use-ride-categories";
import { useRoute } from "@/hooks/use-route";
import { useRideStops } from "@/hooks/rides/use-ride-stops";
import { useWallet } from "@/hooks/use-wallet";
import { cn, formatCurrency } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/revisar-solicitacao")({
  component: RideRequestReviewPage,
});

const paymentLabels: Record<string, string> = {
  pix: "PIX",
  credit: "Cartão de crédito",
  credit_card: "Cartão de crédito",
  debit: "Cartão de débito",
  debit_card: "Cartão de débito",
  cash: "Dinheiro",
  money: "Dinheiro",
  wallet: "Carteira APOIS",
  corporate: "Corporativo",
};

const readBoolean = (details: Record<string, unknown>, key: string) => details[key] === true;
const readString = (details: Record<string, unknown>, key: string) =>
  typeof details[key] === "string" ? String(details[key]) : "";
const readNumber = (details: Record<string, unknown>, key: string) =>
  typeof details[key] === "number" && Number.isFinite(details[key]) ? Number(details[key]) : 0;

function formatFreeWindow(seconds: number) {
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
  }
  return `${seconds} segundos`;
}

function getServiceSummary(category: string | undefined, details: Record<string, unknown>) {
  if (category === "fretes") {
    const helpers = readString(details, "ajudantes");
    return [
      ["Serviço", readString(details, "tipoServico") === "mudanca" ? "Mudança" : "Frete"],
      ["Ajudantes", helpers === "dois" ? "2 ajudantes" : helpers === "um" ? "1 ajudante" : "Nenhum"],
      ["Item pesado", readBoolean(details, "itemPesado") ? "Sim" : "Não"],
      ["Desmontagem", readBoolean(details, "desmontar") ? "Sim" : "Não"],
      ["Embalagem", readBoolean(details, "embalar") ? "Sim" : "Não"],
    ];
  }

  if (category === "guincho") {
    const vehicle = readString(details, "tipoVeiculo");
    return [
      ["Veículo", vehicle ? vehicle.charAt(0).toUpperCase() + vehicle.slice(1) : "Não informado"],
      ["Veículo liga", readBoolean(details, "veiculoLiga") ? "Sim" : "Não"],
      ["Acidente", readBoolean(details, "acidente") ? "Sim" : "Não"],
      ["Rodas travadas", readBoolean(details, "rodasTravadas") ? "Sim" : "Não"],
      ["Plataforma", readBoolean(details, "precisaPlataforma") ? "Necessária" : "Não indicada"],
    ];
  }

  if (category === "envios") {
    const item = readString(details, "tipoItem");
    return [
      ["Item", item ? item.charAt(0).toUpperCase() + item.slice(1) : "Não informado"],
      ["Peso", `${readNumber(details, "weightKg").toFixed(1)} kg`],
      ["Frágil", readBoolean(details, "fragil") ? "Sim" : "Não"],
      ["Destinatário", readString(details, "nomeDestinatario") || "Não informado"],
    ];
  }

  return [];
}

function RideRequestReviewPage() {
  const navigate = useNavigate();
  const { confirmRide, request } = useRideRequest();
  const { recoverActiveRide } = useActiveRide();
  const { address: pickupAddress, pickupLabel } = usePickupAddress();
  const { destination } = useDestination();
  const { route } = useRoute();
  const { selectedCategory } = useRideCategories();
  const { checkout } = useCheckoutPreparation();
  const { selectedMethod } = usePaymentMethods();
  const { state: walletState, wallet } = useWallet();
  const { orderedStops } = useRideStops();
  const { serviceDetails } = usePricing();
  const {
    policy,
    isLoading: isPolicyLoading,
    error: policyError,
    refresh: refreshPolicy,
  } = useCancellationPolicy();
  const confirmationInFlightRef = useRef(false);

  const serviceSummary = useMemo(
    () => getServiceSummary(selectedCategory?.code, serviceDetails),
    [selectedCategory?.code, serviceDetails],
  );

  const handleBack = () => void navigate({ to: "/inicio" });

  const handleConfirm = useCallback(async (): Promise<void> => {
    if (
      confirmationInFlightRef.current ||
      request.isSubmitting ||
      walletState === "blocked" ||
      isPolicyLoading ||
      policyError ||
      !checkout.readiness
    ) {
      return;
    }

    confirmationInFlightRef.current = true;
    try {
      const existingRideId = await recoverActiveRide();
      if (existingRideId) {
        await navigate({
          to: "/corrida/$rideId",
          params: { rideId: existingRideId },
          replace: true,
        });
        return;
      }

      const response = await confirmRide();
      if (response?.ok && response.rideId) {
        await navigate({
          to: "/corrida/$rideId",
          params: { rideId: response.rideId },
          replace: true,
        });
      }
    } finally {
      confirmationInFlightRef.current = false;
    }
  }, [
    checkout.readiness,
    confirmRide,
    isPolicyLoading,
    navigate,
    policyError,
    recoverActiveRide,
    request.isSubmitting,
    walletState,
  ]);

  const canSubmit =
    checkout.readiness &&
    Boolean(route) &&
    Boolean(destination) &&
    Boolean(selectedCategory) &&
    Boolean(selectedMethod) &&
    walletState !== "blocked" &&
    !request.isSubmitting &&
    !isPolicyLoading &&
    !policyError;

  const paymentLabel = selectedMethod
    ? paymentLabels[selectedMethod] || selectedMethod
    : "Não selecionado";

  return (
    <div className="app-screen min-h-0 bg-apois-black text-white">
      <ScreenHeader
        title="Revisar solicitação"
        subtitle="Confira tudo antes de pedir"
        onBack={handleBack}
      />

      <div className="app-scroll flex-1 space-y-5 px-5 py-5">
        <section className="app-surface rounded-3xl p-5" aria-label="Trajeto da corrida">
          <div className="flex gap-4">
            <div className="flex w-4 shrink-0 flex-col items-center py-1">
              <div className="h-3 w-3 rounded-full bg-apois-success shadow-[0_0_9px_rgba(41,201,111,0.45)]" />
              <div className="my-1 w-px flex-1 bg-zinc-700" />
              {orderedStops.map((stop) => (
                <div key={stop.id} className="contents">
                  <div className="flex h-4 w-4 items-center justify-center rounded-full border border-apois-yellow/50 bg-zinc-900 text-[8px] font-black text-apois-yellow">
                    {stop.order + 1}
                  </div>
                  <div className="my-1 w-px flex-1 bg-zinc-700" />
                </div>
              ))}
              <div className="h-3 w-3 rounded-sm bg-apois-yellow shadow-[0_0_9px_rgba(255,184,0,0.4)]" />
            </div>

            <div className="min-w-0 flex-1 space-y-5">
              <AddressBlock
                label="Embarque"
                value={
                  pickupAddress ||
                  pickupLabel ||
                  (route
                    ? `Local ${route.origin.lat.toFixed(5)}, ${route.origin.lng.toFixed(5)}`
                    : "Localização indisponível")
                }
              />

              {orderedStops.map((stop, index) => (
                <AddressBlock
                  key={stop.id}
                  label={`Parada ${index + 1}`}
                  value={stop.formattedAddress || stop.label}
                />
              ))}

              <AddressBlock
                label="Destino"
                value={destination?.formattedAddress || destination?.label || "Destino indisponível"}
              />
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <SummaryCard label="Categoria" value={selectedCategory?.label || "Não selecionada"} highlight />
          <SummaryCard label="Pagamento" value={paymentLabel} />
          <SummaryCard
            label="Distância"
            value={route ? `${(route.distanceMeters / 1000).toFixed(1)} km` : "--"}
          />
          <SummaryCard
            label="Tempo estimado"
            value={route ? `${Math.max(1, Math.ceil(route.durationSeconds / 60))} min` : "--"}
          />
        </section>

        {serviceSummary.length > 0 ? (
          <section className="app-surface rounded-3xl p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
              Detalhes do serviço
            </p>
            <div className="mt-4 grid grid-cols-2 gap-4">
              {serviceSummary.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">{label}</p>
                  <p className="mt-1 truncate text-xs font-black text-zinc-200">{value}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="app-surface rounded-3xl p-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
                Estimativa total
              </p>
              <p className="mt-1 text-3xl font-black tracking-tight text-white">
                {formatCurrency(checkout.finalTotal)}
              </p>
            </div>
            <div className="rounded-xl border border-apois-yellow/15 bg-apois-yellow/8 px-3 py-2 text-right">
              <p className="text-[10px] font-black uppercase text-apois-yellow">Valor validado</p>
              <p className="mt-0.5 text-[10px] text-zinc-500">pelo servidor ao confirmar</p>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-white/7 bg-black/30 p-3">
            <Info className="mt-0.5 shrink-0 text-zinc-500" size={16} />
            <p className="text-[11px] leading-5 text-zinc-400">
              A estimativa considera a rota, as paradas e os detalhes informados. Alterações durante o serviço só poderão ajustar o valor quando forem previstas nas regras da categoria.
            </p>
          </div>
        </section>

        <section
          className={cn(
            "rounded-3xl border p-5",
            policyError
              ? "border-apois-danger/25 bg-apois-danger/10"
              : "border-apois-success/20 bg-apois-success/8",
          )}
        >
          <div className="flex items-start gap-3">
            {isPolicyLoading ? (
              <Loader2 className="mt-0.5 shrink-0 animate-spin text-apois-yellow" size={21} />
            ) : policyError ? (
              <AlertTriangle className="mt-0.5 shrink-0 text-apois-danger" size={21} />
            ) : (
              <ShieldCheck className="mt-0.5 shrink-0 text-apois-success" size={21} />
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-black text-white">Regra de cancelamento</h2>
              {isPolicyLoading ? (
                <p className="mt-1 text-xs leading-5 text-zinc-400">Carregando a regra vigente...</p>
              ) : policyError ? (
                <>
                  <p className="mt-1 text-xs leading-5 text-red-300">
                    A regra vigente não pôde ser carregada. A solicitação permanece bloqueada para evitar cobrança sem aviso.
                  </p>
                  <button
                    type="button"
                    onClick={() => void refreshPolicy()}
                    className="app-pressable mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-apois-danger/25 bg-black/20 px-4 text-xs font-black text-white"
                  >
                    <RefreshCw size={15} />
                    Carregar novamente
                  </button>
                </>
              ) : policy.enabled && policy.amount > 0 ? (
                <p className="mt-1 text-xs leading-5 text-zinc-300">
                  Cancelamento sem multa durante os primeiros <strong>{formatFreeWindow(policy.freeSeconds)}</strong>. Depois desse período, a multa atual é de <strong>{formatCurrency(policy.amount)}</strong>.
                  {policy.blockAfterDriverArrival
                    ? " Após o motorista chegar ao embarque, o cancelamento fica bloqueado."
                    : ""}
                </p>
              ) : (
                <p className="mt-1 text-xs leading-5 text-zinc-300">
                  A cobrança de multa está desativada no momento.
                  {policy.blockAfterDriverArrival
                    ? " Após o motorista chegar ao embarque, o cancelamento fica bloqueado."
                    : ""}
                </p>
              )}
            </div>
          </div>
        </section>

        {walletState === "blocked" ? (
          <section className="flex items-start gap-4 rounded-3xl border border-apois-danger/25 bg-apois-danger/10 p-5">
            <ShieldAlert className="shrink-0 text-apois-danger" size={24} />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-black uppercase tracking-tight text-red-300">Carteira bloqueada</h2>
              <p className="mt-1 text-xs leading-5 text-red-300/80">
                {wallet?.blockedReason ||
                  "Existe uma pendência na sua carteira. Regularize para solicitar uma corrida."}
              </p>
              <button
                type="button"
                onClick={() => void navigate({ to: "/carteira" })}
                className="app-pressable mt-3 min-h-10 rounded-xl bg-white px-4 text-xs font-black text-black"
              >
                Abrir carteira
              </button>
            </div>
          </section>
        ) : null}

        {!checkout.readiness ? (
          <section className="rounded-3xl border border-apois-yellow/20 bg-apois-yellow/8 p-4">
            <div className="flex items-start gap-3">
              <Clock3 className="mt-0.5 shrink-0 text-apois-yellow" size={20} />
              <div>
                <p className="text-sm font-black text-white">Ainda faltam informações</p>
                <ul className="mt-2 space-y-1 text-xs text-zinc-400">
                  {checkout.missingRequirements.map((requirement) => (
                    <li key={requirement}>• {requirement}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ) : null}

        {request.error ? (
          <section className="flex items-center gap-3 rounded-2xl border border-apois-danger/20 bg-apois-danger/10 p-4">
            <AlertTriangle className="shrink-0 text-apois-danger" size={20} />
            <p className="text-xs font-medium leading-5 text-red-300">{request.error}</p>
          </section>
        ) : null}
      </div>

      <footer className="app-safe-bottom shrink-0 border-t border-white/7 bg-apois-black/94 px-5 pb-4 pt-4 backdrop-blur-xl">
        <button
          type="button"
          onClick={
            walletState === "blocked"
              ? () => void navigate({ to: "/carteira" })
              : () => void handleConfirm()
          }
          disabled={walletState !== "blocked" && !canSubmit}
          className={cn(
            "app-pressable flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl text-lg font-black",
            walletState === "blocked"
              ? "bg-white text-black"
              : canSubmit
                ? "app-gold-glow bg-apois-yellow text-black"
                : "cursor-not-allowed bg-zinc-800 text-zinc-500",
          )}
        >
          {request.isSubmitting ? (
            <>
              <Loader2 className="animate-spin" size={23} />
              Validando e solicitando...
            </>
          ) : walletState === "blocked" ? (
            "Regularizar carteira"
          ) : (
            <>
              Solicitar corrida
              <ChevronRight size={23} strokeWidth={3} />
            </>
          )}
        </button>
      </footer>
    </div>
  );
}

function AddressBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      <p className="mt-1 line-clamp-2 text-sm font-bold leading-5 text-white">{value}</p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="app-surface min-w-0 rounded-2xl p-4">
      <div className="flex items-center gap-1.5 text-zinc-500">
        <MapPin size={11} />
        <p className="truncate text-[9px] font-black uppercase tracking-[0.14em]">{label}</p>
      </div>
      <p className={cn("mt-2 truncate text-sm font-black", highlight ? "text-apois-yellow" : "text-white")}>
        {value}
      </p>
    </div>
  );
}
