import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef } from "react";
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
  const { route, freeze: freezeRoute, unfreeze: unfreezeRoute } = useRoute();
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

  useEffect(() => {
    freezeRoute();
    return () => unfreezeRoute();
  }, [freezeRoute, unfreezeRoute]);

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
        subtitle="Confira antes de pedir"
        onBack={handleBack}
      />

      <div className="app-scroll flex-1 space-y-3 px-4 py-3">
        <section className="app-surface rounded-2xl p-3.5" aria-label="Trajeto da corrida">
          <div className="flex gap-3">
            <div className="flex w-3.5 shrink-0 flex-col items-center py-0.5">
              <div className="h-2.5 w-2.5 rounded-full bg-apois-success shadow-[0_0_8px_rgba(41,201,111,0.4)]" />
              <div className="my-0.5 w-px flex-1 bg-zinc-700" />
              {orderedStops.map((stop) => (
                <div key={stop.id} className="contents">
                  <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-apois-yellow/50 bg-zinc-900 text-[7px] font-black text-apois-yellow">
                    {stop.order + 1}
                  </div>
                  <div className="my-0.5 w-px flex-1 bg-zinc-700" />
                </div>
              ))}
              <div className="h-2.5 w-2.5 rounded-sm bg-apois-yellow shadow-[0_0_8px_rgba(255,184,0,0.35)]" />
            </div>

            <div className="min-w-0 flex-1 space-y-2.5">
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

        <section className="grid grid-cols-4 gap-2 max-[390px]:grid-cols-2">
          <SummaryCard label="Categoria" value={selectedCategory?.label || "Não selecionada"} highlight />
          <SummaryCard label="Pagamento" value={paymentLabel} />
          <SummaryCard
            label="Distância"
            value={route ? `${(route.distanceMeters / 1000).toFixed(1)} km` : "--"}
          />
          <SummaryCard
            label="Tempo"
            value={route ? `${Math.max(1, Math.ceil(route.durationSeconds / 60))} min` : "--"}
          />
        </section>

        {serviceSummary.length > 0 ? (
          <section className="app-surface rounded-2xl p-3.5">
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-zinc-500">
              Detalhes do serviço
            </p>
            <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
              {serviceSummary.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-zinc-600">{label}</p>
                  <p className="mt-0.5 truncate text-[11px] font-black text-zinc-200">{value}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="app-surface rounded-2xl p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-zinc-500">
                Estimativa total
              </p>
              <p className="mt-0.5 text-2xl font-black leading-none tracking-tight text-white">
                {formatCurrency(checkout.finalTotal)}
              </p>
            </div>
            <div className="shrink-0 rounded-xl border border-apois-yellow/15 bg-apois-yellow/8 px-2.5 py-1.5 text-right">
              <p className="text-[9px] font-black uppercase text-apois-yellow">Validado</p>
              <p className="mt-0.5 text-[8px] text-zinc-500">pelo servidor</p>
            </div>
          </div>

          <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-white/7 bg-black/30 px-2.5 py-2">
            <Info className="mt-0.5 shrink-0 text-zinc-500" size={14} />
            <p className="line-clamp-2 text-[9px] leading-4 text-zinc-400">
              A estimativa considera rota, paradas e detalhes informados. O valor é validado pelo servidor ao solicitar.
            </p>
          </div>
        </section>

        <section
          className={cn(
            "rounded-2xl border p-3.5",
            policyError
              ? "border-apois-danger/25 bg-apois-danger/10"
              : "border-apois-success/20 bg-apois-success/8",
          )}
        >
          <div className="flex items-start gap-2.5">
            {isPolicyLoading ? (
              <Loader2 className="mt-0.5 shrink-0 animate-spin text-apois-yellow" size={18} />
            ) : policyError ? (
              <AlertTriangle className="mt-0.5 shrink-0 text-apois-danger" size={18} />
            ) : (
              <ShieldCheck className="mt-0.5 shrink-0 text-apois-success" size={18} />
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-[12px] font-black leading-4 text-white">Regra de cancelamento</h2>
              {isPolicyLoading ? (
                <p className="mt-0.5 text-[10px] leading-4 text-zinc-400">Carregando regra vigente...</p>
              ) : policyError ? (
                <>
                  <p className="mt-0.5 text-[10px] leading-4 text-red-300">
                    A regra vigente não pôde ser carregada. A solicitação fica bloqueada para evitar cobrança sem aviso.
                  </p>
                  <button
                    type="button"
                    onClick={() => void refreshPolicy()}
                    className="app-pressable mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-apois-danger/25 bg-black/20 px-3 text-[10px] font-black text-white"
                  >
                    <RefreshCw size={13} />
                    Carregar novamente
                  </button>
                </>
              ) : policy.enabled && policy.amount > 0 ? (
                <p className="mt-0.5 text-[10px] leading-4 text-zinc-300">
                  Sem multa por <strong>{formatFreeWindow(policy.freeSeconds)}</strong>; depois, <strong>{formatCurrency(policy.amount)}</strong>.
                  {policy.blockAfterDriverArrival
                    ? " Após a chegada do motorista, o cancelamento fica bloqueado."
                    : ""}
                </p>
              ) : (
                <p className="mt-0.5 text-[10px] leading-4 text-zinc-300">
                  A multa está desativada no momento.
                  {policy.blockAfterDriverArrival
                    ? " Após a chegada do motorista, o cancelamento fica bloqueado."
                    : ""}
                </p>
              )}
            </div>
          </div>
        </section>

        {walletState === "blocked" ? (
          <section className="flex items-start gap-3 rounded-2xl border border-apois-danger/25 bg-apois-danger/10 p-3.5">
            <ShieldAlert className="shrink-0 text-apois-danger" size={20} />
            <div className="min-w-0 flex-1">
              <h2 className="text-[11px] font-black uppercase tracking-tight text-red-300">Pendência financeira</h2>
              <p className="mt-0.5 text-[10px] leading-4 text-red-300/80">
                {wallet?.blockedReason ||
                  "Existe uma multa de cancelamento pendente. Quite a pendência antes de solicitar outra corrida."}
              </p>
              <button
                type="button"
                onClick={() => void navigate({ to: "/carteira" })}
                className="app-pressable mt-2 min-h-8 rounded-lg bg-white px-3 text-[10px] font-black text-black"
              >
                Abrir carteira
              </button>
            </div>
          </section>
        ) : null}

        {!checkout.readiness ? (
          <section className="rounded-2xl border border-apois-yellow/20 bg-apois-yellow/8 p-3">
            <div className="flex items-start gap-2.5">
              <Clock3 className="mt-0.5 shrink-0 text-apois-yellow" size={18} />
              <div>
                <p className="text-[11px] font-black text-white">Ainda faltam informações</p>
                <ul className="mt-1 space-y-0.5 text-[10px] text-zinc-400">
                  {checkout.missingRequirements.map((requirement) => (
                    <li key={requirement}>• {requirement}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ) : null}

        {request.error ? (
          <section className="flex items-center gap-2.5 rounded-xl border border-apois-danger/20 bg-apois-danger/10 p-3">
            <AlertTriangle className="shrink-0 text-apois-danger" size={18} />
            <p className="text-[10px] font-medium leading-4 text-red-300">{request.error}</p>
          </section>
        ) : null}
      </div>

      <footer className="app-safe-bottom shrink-0 border-t border-white/7 bg-apois-black/96 px-4 pb-2.5 pt-2.5 backdrop-blur-xl">
        <button
          type="button"
          onClick={
            walletState === "blocked"
              ? () => void navigate({ to: "/carteira" })
              : () => void handleConfirm()
          }
          disabled={walletState !== "blocked" && !canSubmit}
          className={cn(
            "app-pressable flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-black",
            walletState === "blocked"
              ? "bg-white text-black"
              : canSubmit
                ? "app-gold-glow bg-apois-yellow text-black"
                : "cursor-not-allowed bg-zinc-800 text-zinc-500",
          )}
        >
          {request.isSubmitting ? (
            <>
              <Loader2 className="animate-spin" size={19} />
              Validando e solicitando...
            </>
          ) : walletState === "blocked" ? (
            "Regularizar pendência"
          ) : (
            <>
              Solicitar corrida
              <ChevronRight size={19} strokeWidth={3} />
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
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className="mt-0.5 line-clamp-1 text-[12px] font-bold leading-4 text-white">{value}</p>
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
    <div className="app-surface min-w-0 rounded-xl px-2.5 py-2.5">
      <div className="flex items-center gap-1 text-zinc-500">
        <MapPin size={9} />
        <p className="truncate text-[8px] font-black uppercase tracking-[0.1em]">{label}</p>
      </div>
      <p className={cn("mt-1 truncate text-[11px] font-black", highlight ? "text-apois-yellow" : "text-white")}>
        {value}
      </p>
    </div>
  );
}
