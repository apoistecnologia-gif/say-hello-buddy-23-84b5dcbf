import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Anchor,
  ArrowLeft,
  Bike,
  Car,
  ChevronRight,
  Clock3,
  Info,
  Loader2,
  MapPin,
  Package,
  Pencil,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Truck,
  WalletCards,
} from "lucide-react";
import PassengerMap from "@/components/map/PassengerMap";
import { PaymentMethodList } from "@/components/payments/PaymentMethodSelector";
import { useCancellationPolicy } from "@/hooks/rides/use-cancellation-policy";
import { useActiveRide } from "@/hooks/rides/use-active-ride";
import { useRideRequest } from "@/hooks/rides/use-ride-request";
import { useCheckoutPreparation } from "@/hooks/use-checkout-preparation";
import { useDestination } from "@/hooks/use-destination";
import { useLocation } from "@/hooks/use-location";
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

const categoryDescriptions: Record<string, string> = {
  carros: "Viagem confortável para o dia a dia",
  motos: "Agilidade para trajetos urbanos",
  fretes: "Transporte de volumes e mudanças",
  guincho: "Assistência para seu veículo",
  envios: "Entrega rápida de objetos",
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

function CategoryArtwork({ code }: { code?: string }) {
  const Icon =
    code === "motos"
      ? Bike
      : code === "fretes"
        ? Truck
        : code === "guincho"
          ? Anchor
          : code === "envios"
            ? Package
            : Car;

  return (
    <div className="flex h-[82px] w-[118px] shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-white/[0.07] to-transparent">
      <Icon className="text-apois-yellow" size={52} strokeWidth={1.35} />
    </div>
  );
}

function RideRequestReviewPage() {
  const navigate = useNavigate();
  const { confirmRide, request } = useRideRequest();
  const { recoverActiveRide } = useActiveRide();
  const { address: pickupAddress, pickupLabel } = usePickupAddress();
  const { destination } = useDestination();
  const { location } = useLocation();
  const { route, freeze: freezeRoute, unfreeze: unfreezeRoute } = useRoute();
  const { selectedCategory } = useRideCategories();
  const { checkout } = useCheckoutPreparation();
  const { selectedMethod } = usePaymentMethods();
  const { state: walletState, wallet } = useWallet();
  const { orderedStops } = useRideStops();
  const { serviceDetails } = usePricing();
  const [isPaymentListOpen, setIsPaymentListOpen] = useState(false);
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

  const pickupText =
    pickupAddress ||
    pickupLabel ||
    (route
      ? `Local ${route.origin.lat.toFixed(5)}, ${route.origin.lng.toFixed(5)}`
      : "Localização indisponível");
  const destinationText = destination?.formattedAddress || destination?.label || "Destino indisponível";

  return (
    <div className="app-screen min-h-0 bg-black text-white">
      <header className="app-safe-top app-safe-x shrink-0 bg-black pb-3 pt-3">
        <div className="grid grid-cols-[44px_1fr_auto] items-center gap-2">
          <button
            type="button"
            onClick={handleBack}
            className="app-pressable flex h-11 w-11 items-center justify-center rounded-xl text-apois-yellow"
            aria-label="Voltar"
          >
            <ArrowLeft size={26} />
          </button>
          <div className="text-center">
            <h1 className="text-[20px] font-black tracking-tight text-white">Revisar corrida</h1>
            <p className="mt-0.5 text-[11px] text-zinc-500">Confira os detalhes antes de confirmar</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-black tracking-[-0.06em] text-white">APOIS</p>
            <p className="text-[7px] font-black uppercase tracking-[0.24em] text-apois-yellow">Vamos juntos</p>
          </div>
        </div>
      </header>

      <div className="app-scroll flex-1 space-y-3 px-3 pb-5">
        <section className="relative h-[214px] overflow-hidden rounded-2xl border border-white/10 bg-[#111317] shadow-xl">
          <PassengerMap
            origin={location ? { lat: location.latitude, lng: location.longitude } : undefined}
            destination={destination ? { lat: destination.latitude, lng: destination.longitude } : undefined}
            encodedPolyline={route?.encodedPolyline}
            driverLocation={undefined}
            isStatic
            compact
          />
          <div className="absolute inset-y-0 left-0 z-20 w-[54%] bg-gradient-to-r from-black via-black/92 to-transparent p-4">
            <div className="flex h-full gap-3">
              <div className="flex w-4 shrink-0 flex-col items-center py-1">
                <div className="h-3 w-3 rounded-full border-2 border-apois-yellow bg-black" />
                <div className="my-1 w-px flex-1 border-l border-dashed border-zinc-500" />
                {orderedStops.map((stop, index) => (
                  <div key={stop.id} className="contents">
                    <div className="flex h-4 w-4 items-center justify-center rounded-full border border-apois-yellow bg-black text-[8px] font-black text-apois-yellow">
                      {index + 1}
                    </div>
                    <div className="my-1 w-px flex-1 border-l border-dashed border-zinc-500" />
                  </div>
                ))}
                <div className="h-3 w-3 rounded-full border-2 border-white bg-black" />
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <AddressBlock label="Origem" value={pickupText} />
                {orderedStops.map((stop, index) => (
                  <AddressBlock
                    key={stop.id}
                    label={`Parada ${index + 1}`}
                    value={stop.formattedAddress || stop.label}
                  />
                ))}
                <AddressBlock label="Destino" value={destinationText} />
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleBack}
            className="app-pressable absolute bottom-3 right-3 z-30 flex min-h-10 items-center gap-2 rounded-xl border border-apois-yellow/35 bg-black/90 px-3 text-[11px] font-black text-apois-yellow shadow-xl"
          >
            <Pencil size={14} />
            Alterar rota
          </button>
        </section>

        <section className="grid grid-cols-3 rounded-2xl border border-white/10 bg-[#0e1014] p-2 shadow-lg">
          <Metric label="Distância" value={route ? `${(route.distanceMeters / 1000).toFixed(1).replace(".", ",")} km` : "—"} icon="route" />
          <Metric label="Tempo estimado" value={route ? `${Math.max(1, Math.ceil(route.durationSeconds / 60))} min` : "—"} icon="time" />
          <Metric label="Preço estimado" value={checkout.finalTotal > 0 ? formatCurrency(checkout.finalTotal) : "—"} icon="price" />
        </section>

        <section>
          <h2 className="mb-2 px-1 text-[14px] font-black text-white">Categoria selecionada</h2>
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0e1014] p-3">
            <CategoryArtwork code={selectedCategory?.code} />
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-black text-white">{selectedCategory?.label || selectedCategory?.name || "Categoria"}</p>
              <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-zinc-500">
                {categoryDescriptions[selectedCategory?.code || ""] || selectedCategory?.description || "Serviço selecionado"}
              </p>
            </div>
            <button
              type="button"
              onClick={handleBack}
              className="app-pressable min-h-10 rounded-xl border border-apois-yellow/40 px-3 text-[11px] font-black text-apois-yellow"
            >
              Alterar
            </button>
          </div>
        </section>

        {serviceSummary.length > 0 ? (
          <section className="rounded-2xl border border-white/10 bg-[#0e1014] p-3.5">
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-apois-yellow">Detalhes do serviço</p>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
              {serviceSummary.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-zinc-600">{label}</p>
                  <p className="mt-0.5 truncate text-[11px] font-black text-zinc-200">{value}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <h2 className="mb-2 px-1 text-[14px] font-black text-white">Forma de pagamento</h2>
          <button
            type="button"
            onClick={() => setIsPaymentListOpen(true)}
            className="app-pressable flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-[#0e1014] p-3 text-left"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-apois-yellow">
              <WalletCards size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-black text-white">{paymentLabel}</span>
              <span className="mt-0.5 block text-[10px] text-zinc-500">Método selecionado para esta corrida</span>
            </span>
            <span className="text-[11px] font-black text-apois-yellow">Alterar</span>
            <ChevronRight size={18} className="text-zinc-500" />
          </button>
        </section>

        <section>
          <h2 className="mb-2 px-1 text-[14px] font-black text-white">Resumo do pagamento</h2>
          <div className="rounded-2xl border border-white/10 bg-[#0e1014] p-4">
            <PaymentRow label="Preço estimado" value={formatCurrency(checkout.baseFare)} />
            {checkout.extrasTotal > 0 ? (
              <PaymentRow label="Adicionais informados" value={formatCurrency(checkout.extrasTotal)} />
            ) : null}
            {checkout.discountTotal > 0 ? (
              <PaymentRow label="Desconto" value={`- ${formatCurrency(checkout.discountTotal)}`} positive />
            ) : null}
            <div className="my-3 h-px bg-white/8" />
            <div className="flex items-center justify-between">
              <span className="text-[16px] font-black text-white">Total</span>
              <span className="text-[20px] font-black text-apois-yellow">{formatCurrency(checkout.finalTotal)}</span>
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-white/7 bg-black/30 px-3 py-2">
              <Info className="mt-0.5 shrink-0 text-zinc-500" size={14} />
              <p className="text-[9px] leading-4 text-zinc-500">
                A estimativa usa a rota, as paradas e os detalhes informados. O servidor valida o valor ao solicitar a corrida.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-apois-yellow/25 bg-apois-yellow/[0.04] p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-apois-yellow/25 bg-apois-yellow/10 text-apois-yellow">
              <ShieldCheck size={26} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-black text-apois-yellow">Segurança da corrida</p>
              <p className="mt-1 text-[10px] leading-4 text-zinc-400">
                Os recursos de segurança do APOIS continuam disponíveis durante o acompanhamento da viagem.
              </p>
            </div>
            <ChevronRight size={20} className="text-zinc-600" />
          </div>
        </section>

        <section
          className={cn(
            "rounded-2xl border p-3.5",
            policyError
              ? "border-apois-danger/25 bg-apois-danger/10"
              : "border-white/10 bg-[#0e1014]",
          )}
        >
          <div className="flex items-start gap-2.5">
            {isPolicyLoading ? (
              <Loader2 className="mt-0.5 shrink-0 animate-spin text-apois-yellow" size={18} />
            ) : policyError ? (
              <AlertTriangle className="mt-0.5 shrink-0 text-apois-danger" size={18} />
            ) : (
              <ShieldCheck className="mt-0.5 shrink-0 text-apois-yellow" size={18} />
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

      <footer className="app-safe-bottom shrink-0 bg-black px-3 pb-2.5 pt-2">
        <button
          type="button"
          onClick={
            walletState === "blocked"
              ? () => void navigate({ to: "/carteira" })
              : () => void handleConfirm()
          }
          disabled={walletState !== "blocked" && !canSubmit}
          className={cn(
            "app-pressable flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl text-[17px] font-black shadow-lg",
            walletState === "blocked"
              ? "bg-white text-black"
              : canSubmit
                ? "app-gold-glow bg-apois-yellow text-black"
                : "cursor-not-allowed bg-zinc-800 text-zinc-500",
          )}
        >
          {request.isSubmitting ? (
            <>
              <Loader2 className="animate-spin" size={20} />
              Validando e solicitando...
            </>
          ) : walletState === "blocked" ? (
            "Regularizar pendência"
          ) : (
            <>
              Confirmar corrida
              <ChevronRight size={21} strokeWidth={3} />
            </>
          )}
        </button>
        <div className="mt-2 flex items-center justify-center gap-1.5 text-[9px] text-zinc-600">
          <ShieldCheck size={11} className="text-apois-yellow" />
          Seus dados e pagamentos são protegidos
        </div>
      </footer>

      <PaymentMethodList isOpen={isPaymentListOpen} onClose={() => setIsPaymentListOpen(false)} />
    </div>
  );
}

function AddressBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-black text-apois-yellow">{label}</p>
      <p className="mt-0.5 line-clamp-2 text-[12px] font-bold leading-4 text-white">{value}</p>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: "route" | "time" | "price" }) {
  const Icon = icon === "time" ? Clock3 : icon === "price" ? WalletCards : MapPin;
  return (
    <div className="flex min-w-0 items-center justify-center gap-2 border-r border-white/8 px-2 py-2 last:border-r-0">
      <Icon size={20} className="shrink-0 text-apois-yellow" />
      <div className="min-w-0">
        <p className="truncate text-[9px] text-zinc-500">{label}</p>
        <p className="mt-0.5 truncate text-[13px] font-black text-white">{value}</p>
      </div>
    </div>
  );
}

function PaymentRow({ label, value, positive = false }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3 last:mb-0">
      <span className={cn("text-[11px]", positive ? "text-emerald-400" : "text-zinc-400")}>{label}</span>
      <span className={cn("text-[12px] font-black", positive ? "text-emerald-400" : "text-white")}>{value}</span>
    </div>
  );
}
