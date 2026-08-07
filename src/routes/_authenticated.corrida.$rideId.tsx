import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useActiveRide } from "@/hooks/rides/use-active-ride";
import { ActiveRideMap } from "@/components/map/ActiveRideMap";
import { RideStatusHeader } from "@/components/rides/active/RideStatusHeader";
import { DriverCard } from "@/components/rides/active/DriverCard";
import { VehicleCard } from "@/components/rides/active/VehicleCard";
import { SecurityCodeCard } from "@/components/rides/active/SecurityCodeCard";
import { RideStopsTimeline } from "@/components/rides/active/RideStopsTimeline";
import { CancellationDialog } from "@/components/rides/active/CancellationDialog";
import { RideSafetyDialog } from "@/components/rides/active/RideSafetyDialog";
import { RideRatingCard } from "@/components/rides/RideRatingCard";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  FileText,
  Home,
  RefreshCw,
  Search,
  Share2,
  Shield,
  WifiOff,
  X,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/corrida/$rideId")({
  component: ActiveRidePage,
});

function publicShareUrl(token: string): string | null {
  const configuredBase = String(import.meta.env.VITE_PUBLIC_APP_URL ?? "").trim();
  const currentOriginIsPublic =
    window.location.protocol.startsWith("http") &&
    !["localhost", "127.0.0.1", "0.0.0.0"].includes(window.location.hostname);
  const base =
    configuredBase ||
    (currentOriginIsPublic ? `${window.location.origin}${window.location.pathname}` : "");
  if (!base) return null;

  const normalizedBase = base.replace(/\/#\/?$/, "").replace(/\/+$/, "");
  return `${normalizedBase}/#/acompanhar/${encodeURIComponent(token)}`;
}

function ActiveRidePage() {
  const { rideId } = Route.useParams();
  const navigate = useNavigate();
  const {
    ride,
    status,
    screenState,
    isRefreshing,
    isRealtimeConnected,
    loadRide,
    refreshRide,
    actionAvailability,
    clearRide,
  } = useActiveRide();

  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [isSafetyDialogOpen, setIsSafetyDialogOpen] = useState(false);
  const [showReconnectWarning, setShowReconnectWarning] = useState(false);

  useEffect(() => {
    if (rideId) void loadRide(rideId);
  }, [rideId, loadRide]);

  useEffect(() => {
    if (screenState !== "active" || isRealtimeConnected) {
      setShowReconnectWarning(false);
      return;
    }

    const timer = window.setTimeout(() => setShowReconnectWarning(true), 1800);
    return () => window.clearTimeout(timer);
  }, [isRealtimeConnected, screenState]);

  const handleBack = () => {
    if (screenState === "completed") {
      clearRide();
      void navigate({ to: "/corridas/$rideId", params: { rideId } });
      return;
    }
    if (screenState === "cancelled") clearRide();
    void navigate({ to: "/inicio" });
  };

  const handleReturnHome = () => {
    clearRide();
    void navigate({ to: "/inicio" });
  };

  const handleShareRide = async (): Promise<void> => {
    if (!ride) return;

    const trackingUrl = ride.share_token ? publicShareUrl(ride.share_token) : null;
    const vehicle = [ride.driver_vehicle_model, ride.driver_vehicle_color]
      .filter(Boolean)
      .join(" • ");
    const lines = [
      "Acompanhe minha corrida pela APOIS.",
      `Origem: ${ride.origin_name}`,
      `Destino: ${ride.destination_name}`,
      ride.driver_name ? `Motorista: ${ride.driver_name}` : null,
      vehicle ? `Veículo: ${vehicle}` : null,
      ride.driver_vehicle_plate ? `Placa: ${ride.driver_vehicle_plate}` : null,
      trackingUrl ? `Acompanhamento: ${trackingUrl}` : null,
    ].filter((line): line is string => Boolean(line));
    const text = lines.join("\n");

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Acompanhamento de corrida APOIS",
          text,
          ...(trackingUrl ? { url: trackingUrl } : {}),
        });
        return;
      }

      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(text);
      toast.success(
        trackingUrl
          ? "Link de acompanhamento copiado."
          : "Resumo da corrida copiado. O link será incluído após a publicação do endereço oficial.",
      );
    } catch (caughtError: unknown) {
      if (caughtError instanceof DOMException && caughtError.name === "AbortError") return;
      toast.error("Não foi possível compartilhar esta corrida.");
    }
  };

  if (screenState === "loading" || screenState === "idle") {
    return (
      <div className="flex h-[100dvh] flex-col space-y-6 bg-black p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full bg-zinc-900" />
          <Skeleton className="h-6 w-32 bg-zinc-900" />
        </div>
        <Skeleton className="h-24 w-full rounded-2xl bg-zinc-900" />
        <Skeleton className="w-full flex-1 rounded-3xl bg-zinc-900" />
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-2xl bg-zinc-900" />
          <Skeleton className="h-16 w-full rounded-2xl bg-zinc-900" />
        </div>
      </div>
    );
  }

  if (screenState === "not_found" || screenState === "unauthorized" || screenState === "failed") {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center space-y-6 bg-black p-8 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-zinc-900">
          <X className="text-zinc-600" size={40} />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-black text-white">Ops! Algo deu errado</h2>
          <p className="text-sm font-medium text-zinc-500">
            {screenState === "not_found"
              ? "Esta corrida não foi encontrada."
              : screenState === "unauthorized"
                ? "Você não tem permissão para ver esta corrida."
                : "Não conseguimos carregar os dados no momento."}
          </p>
        </div>
        <Button
          onClick={handleReturnHome}
          className="h-12 w-full rounded-2xl bg-apois-yellow font-black text-black"
        >
          Voltar para o Início
        </Button>
      </div>
    );
  }

  if (!ride || !status) return null;

  const isQueuedRide =
    status === "procurar_motorista" &&
    Boolean(ride.driver_id && ride.queued_after_ride_id);

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-black">
      <div className="pointer-events-none absolute left-6 right-6 top-6 z-20 flex items-center justify-between">
        <button
          type="button"
          aria-label="Voltar"
          onClick={handleBack}
          className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/60 backdrop-blur-md transition-transform active:scale-95"
        >
          <ChevronLeft className="text-white" size={20} />
        </button>

        <div className="pointer-events-auto flex gap-3">
          {actionAvailability?.canShareRide ? (
            <button
              type="button"
              aria-label="Compartilhar corrida"
              onClick={() => void handleShareRide()}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/60 backdrop-blur-md transition-transform active:scale-95"
            >
              <Share2 className="text-white" size={18} />
            </button>
          ) : null}
          {actionAvailability?.canOpenSafety ? (
            <button
              type="button"
              aria-label="Abrir recursos de segurança"
              onClick={() => setIsSafetyDialogOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-red-500/20 bg-red-500/80 backdrop-blur-md transition-transform active:scale-95"
            >
              <Shield className="text-white" size={18} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="relative flex-1">
        <ActiveRideMap ride={ride} />

        <div className="absolute left-6 right-6 top-20 z-10 space-y-3">
          <RideStatusHeader status={status} isRefreshing={isRefreshing} isQueuedRide={isQueuedRide} />

          {screenState === "active" && showReconnectWarning ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-400/20 bg-black/80 px-4 py-3 text-white backdrop-blur-md">
              <div className="flex min-w-0 items-center gap-3">
                <WifiOff className="shrink-0 text-amber-400" size={18} />
                <div className="min-w-0">
                  <p className="text-xs font-black">Reconectando a corrida</p>
                  <p className="truncate text-[10px] text-zinc-400">
                    Os dados serão atualizados assim que a conexão voltar.
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Atualizar corrida"
                onClick={() => void refreshRide()}
                disabled={isRefreshing}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 disabled:opacity-50"
              >
                <RefreshCw className={isRefreshing ? "animate-spin" : ""} size={16} />
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="max-h-[64vh] space-y-4 overflow-y-auto rounded-t-[32px] border-t border-white/5 bg-zinc-950 px-6 pb-8 pt-6 shadow-[0_-8px_32px_rgba(0,0,0,0.5)] scrollbar-hide"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={status}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            {(isQueuedRide || (status !== "procurar_motorista" && status !== "agendada")) ? (
              <>
                <DriverCard ride={ride} />
                <VehicleCard ride={ride} />
                {["motorista_a_caminho", "motorista_chegou"].includes(status) ? (
                  <SecurityCodeCard code={ride.security_code} />
                ) : null}
              </>
            ) : null}

            {status === "procurar_motorista" && !isQueuedRide ? (
              <div className="flex flex-col items-center justify-center space-y-4 rounded-2xl border border-white/5 bg-zinc-900/50 p-8 text-center">
                <div className="relative">
                  <div className="h-16 w-16 animate-spin rounded-full border-2 border-apois-yellow/20 border-t-apois-yellow" />
                  <Search
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-apois-yellow"
                    size={24}
                  />
                </div>
                <div>
                  <h4 className="font-black text-white">Buscando motoristas</h4>
                  <p className="mt-1 text-[10px] font-medium text-zinc-500">
                    A busca continuará enquanto houver motoristas elegíveis na região.
                  </p>
                </div>
              </div>
            ) : null}

            {isQueuedRide ? (
              <div className="rounded-2xl border border-apois-yellow/20 bg-apois-yellow/10 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-apois-yellow">Motorista confirmado</p>
                <p className="mt-2 text-sm font-black text-white">Sua corrida já está reservada.</p>
                <p className="mt-1 text-[11px] font-medium leading-5 text-zinc-400">O motorista está finalizando uma viagem próxima. Você poderá acompanhar a aproximação assim que ele iniciar o deslocamento até o embarque.</p>
              </div>
            ) : null}

            {screenState === "completed" || screenState === "cancelled" ? (
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-zinc-900/50 p-4">
                  <span className="text-xs font-black uppercase text-zinc-500">Valor total</span>
                  <span className="text-xl font-black text-white">
                    R$ {(ride.final_price ?? ride.estimated_price).toFixed(2).replace(".", ",")}
                  </span>
                </div>

                {screenState === "completed" ? (
                  <RideRatingCard
                    rideId={ride.id}
                    driverName={ride.driver_name}
                    currentRating={ride.passenger_rating ?? null}
                    onRated={() => loadRide(ride.id)}
                  />
                ) : null}

                {screenState === "completed" ? (
                  <Button
                    onClick={() => {
                      clearRide();
                      void navigate({
                        to: "/corridas/$rideId",
                        params: { rideId: ride.id },
                      });
                    }}
                    className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-apois-yellow font-black text-black"
                  >
                    <FileText size={18} />
                    Ver comprovante e detalhes
                  </Button>
                ) : null}

                <Button
                  onClick={handleReturnHome}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white font-black text-black"
                >
                  <Home size={18} />
                  Voltar ao início
                </Button>
              </div>
            ) : null}

            <RideStopsTimeline ride={ride} />

            {screenState === "active" ? (
              <div className="flex items-center justify-between px-1 pt-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                    Estimativa
                  </p>
                  <p className="text-lg font-black text-white">
                    R$ {ride.estimated_price.toFixed(2).replace(".", ",")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                    Pagamento
                  </p>
                  <p className="text-sm font-black uppercase tracking-tighter text-white">
                    {ride.payment_method}
                  </p>
                </div>
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>

        {actionAvailability?.canCancel ? (
          <Button
            variant="ghost"
            onClick={() => setIsCancelDialogOpen(true)}
            className="h-12 w-full rounded-2xl text-xs font-black text-zinc-600 transition-colors hover:bg-red-500/5 hover:text-red-500"
          >
            CANCELAR CORRIDA
          </Button>
        ) : null}
      </motion.div>

      <CancellationDialog
        isOpen={isCancelDialogOpen}
        onClose={() => setIsCancelDialogOpen(false)}
        rideId={ride.id}
        rideCreatedAt={ride.created_at}
        onSuccess={() => {
          setIsCancelDialogOpen(false);
          void loadRide(ride.id);
        }}
      />

      <RideSafetyDialog
        open={isSafetyDialogOpen}
        onOpenChange={setIsSafetyDialogOpen}
        driverName={ride.driver_name}
        driverPhone={ride.driver_phone}
        onShareRide={async () => {
          setIsSafetyDialogOpen(false);
          await handleShareRide();
        }}
      />
    </div>
  );
}
