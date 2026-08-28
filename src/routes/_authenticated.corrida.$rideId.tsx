import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useActiveRide } from "@/hooks/rides/use-active-ride";
import { ActiveRideMap } from "@/components/map/ActiveRideMap";
import { DriverCard } from "@/components/rides/active/DriverCard";
import { VehicleCard } from "@/components/rides/active/VehicleCard";
import { CancellationDialog } from "@/components/rides/active/CancellationDialog";
import { RideSafetyDialog } from "@/components/rides/active/RideSafetyDialog";
import { SearchingDriverScreen } from "@/components/rides/active/SearchingDriverScreen";
import { ActiveJourneyScreen } from "@/components/rides/active/ActiveJourneyScreen";
import { RideRatingCard } from "@/components/rides/RideRatingCard";
import { RidePixPaymentCard } from "@/components/payments/RidePixPaymentCard";
import { Button } from "@/components/ui/button";
import { passengerShareService } from "@/services/safety/passenger-share-service";
import { FileText, Home, RefreshCw, X } from "lucide-react";
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
  const [isSharingRide, setIsSharingRide] = useState(false);

  useEffect(() => {
    if (rideId) void loadRide(rideId);
  }, [rideId, loadRide]);

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
    if (!ride || isSharingRide) return;

    if (!publicShareUrl("preview")) {
      toast.error("Acompanhamento público ainda não está configurado neste build.");
      return;
    }

    setIsSharingRide(true);
    try {
      const session = await passengerShareService.create(ride.id);
      const trackingUrl = publicShareUrl(session.token);
      if (!trackingUrl) throw new Error("public_share_url_unavailable");

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
        `Acompanhamento: ${trackingUrl}`,
      ].filter((line): line is string => Boolean(line));
      const text = lines.join("\n");

      if (navigator.share) {
        await navigator.share({
          title: "Acompanhamento de corrida APOIS",
          text,
          url: trackingUrl,
        });
        return;
      }

      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(text);
      toast.success("Link protegido de acompanhamento copiado.");
    } catch (caughtError: unknown) {
      if (caughtError instanceof DOMException && caughtError.name === "AbortError") return;
      toast.error(
        caughtError instanceof Error && !caughtError.message.startsWith("public_share_url")
          ? caughtError.message
          : "Não foi possível compartilhar esta corrida.",
      );
    } finally {
      setIsSharingRide(false);
    }
  };

  if (screenState === "loading" || screenState === "idle") {
    return (
      <div className="flex h-[100dvh] flex-col space-y-5 bg-black p-5">
        <div className="flex items-center gap-4">
          <Skeleton className="h-11 w-11 rounded-full bg-zinc-900" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40 bg-zinc-900" />
            <Skeleton className="h-3 w-28 bg-zinc-900" />
          </div>
        </div>
        <Skeleton className="h-[330px] w-full rounded-[26px] bg-zinc-900" />
        <Skeleton className="h-24 w-full rounded-3xl bg-zinc-900" />
        <Skeleton className="h-40 w-full rounded-3xl bg-zinc-900" />
      </div>
    );
  }

  if (screenState === "not_found" || screenState === "unauthorized" || screenState === "failed") {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center space-y-6 bg-black p-8 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/8 bg-zinc-900">
          <X className="text-zinc-600" size={40} />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-black text-white">Não foi possível abrir a corrida</h2>
          <p className="text-sm font-medium text-zinc-500">
            {screenState === "not_found"
              ? "Esta corrida não foi encontrada."
              : screenState === "unauthorized"
                ? "Você não tem permissão para visualizar esta corrida."
                : "Não conseguimos carregar os dados agora."}
          </p>
        </div>
        <Button onClick={handleReturnHome} className="h-12 w-full rounded-2xl bg-apois-yellow font-black text-black">
          Voltar para o início
        </Button>
      </div>
    );
  }

  if (!ride || !status) return null;

  const isQueuedRide =
    status === "procurar_motorista" && Boolean(ride.driver_id && ride.queued_after_ride_id);

  if (status === "aguardando_pagamento" && screenState === "active") {
    return (
      <>
        <div className="app-screen min-h-0 bg-black text-white">
          <header className="app-safe-top app-safe-x shrink-0 border-b border-white/5 bg-black pb-3 pt-3 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-apois-yellow">APOIS</p>
            <h1 className="mt-1 text-xl font-black">Pagamento da corrida</h1>
            <p className="mt-1 text-[11px] text-zinc-500">Nenhum motorista será chamado enquanto o Pix estiver pendente.</p>
          </header>

          <div className="app-scroll flex-1 space-y-3 px-4 py-4">
            <section className="h-[190px] overflow-hidden rounded-[26px] border border-white/8 bg-zinc-900">
              <ActiveRideMap ride={ride} />
            </section>

            <section className="rounded-3xl border border-white/8 bg-[#0e1014] p-4">
              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-500">Rota confirmada</p>
              <p className="mt-2 text-xs font-bold text-zinc-300">{ride.origin_name}</p>
              <p className="my-1 text-[10px] text-zinc-600">até</p>
              <p className="text-xs font-bold text-zinc-300">{ride.destination_name}</p>
            </section>

            <RidePixPaymentCard rideId={ride.id} officialAmount={ride.estimated_price} />

            <button
              type="button"
              onClick={() => void refreshRide()}
              disabled={isRefreshing}
              className="app-pressable flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] text-xs font-black text-zinc-300 disabled:opacity-60"
            >
              <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
              Atualizar status da corrida
            </button>

            {actionAvailability?.canCancel ? (
              <button
                type="button"
                onClick={() => setIsCancelDialogOpen(true)}
                className="app-pressable min-h-12 w-full rounded-2xl border border-red-400/20 bg-red-400/5 text-xs font-black text-red-300"
              >
                Cancelar solicitação
              </button>
            ) : null}
          </div>
        </div>

        <CancellationDialog
          isOpen={isCancelDialogOpen}
          onClose={() => setIsCancelDialogOpen(false)}
          rideId={ride.id}
          rideCreatedAt={ride.created_at}
          onSuccess={() => {
            setIsCancelDialogOpen(false);
            clearRide();
            void navigate({ to: "/inicio", replace: true });
          }}
        />
      </>
    );
  }

  if (status === "procurar_motorista" && !isQueuedRide && screenState === "active") {
    return (
      <>
        <SearchingDriverScreen
          ride={ride}
          isRefreshing={isRefreshing}
          isRealtimeConnected={isRealtimeConnected}
          canCancel={Boolean(actionAvailability?.canCancel)}
          onRefresh={() => void refreshRide()}
          onCancel={() => setIsCancelDialogOpen(true)}
        />
        <CancellationDialog
          isOpen={isCancelDialogOpen}
          onClose={() => setIsCancelDialogOpen(false)}
          rideId={ride.id}
          rideCreatedAt={ride.created_at}
          onSuccess={() => {
            setIsCancelDialogOpen(false);
            clearRide();
            void navigate({ to: "/inicio", replace: true });
          }}
        />
      </>
    );
  }

  if (
    screenState === "active" &&
    ["motorista_a_caminho", "motorista_chegou", "em_viagem"].includes(status)
  ) {
    return (
      <>
        <ActiveJourneyScreen
          ride={ride}
          status={status}
          isRefreshing={isRefreshing}
          isRealtimeConnected={isRealtimeConnected}
          canCancel={Boolean(actionAvailability?.canCancel)}
          canShare={Boolean(actionAvailability?.canShareRide)}
          canOpenSafety={Boolean(actionAvailability?.canOpenSafety)}
          isSharing={isSharingRide}
          onBack={handleBack}
          onRefresh={() => void refreshRide()}
          onCancel={() => setIsCancelDialogOpen(true)}
          onShare={() => void handleShareRide()}
          onSafety={() => setIsSafetyDialogOpen(true)}
        />

        <CancellationDialog
          isOpen={isCancelDialogOpen}
          onClose={() => setIsCancelDialogOpen(false)}
          rideId={ride.id}
          rideCreatedAt={ride.created_at}
          onSuccess={() => {
            setIsCancelDialogOpen(false);
            clearRide();
            void navigate({ to: "/inicio", replace: true });
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
      </>
    );
  }

  if (screenState === "completed" || screenState === "cancelled") {
    return (
      <div className="app-screen min-h-0 bg-black text-white">
        <header className="app-safe-top app-safe-x shrink-0 border-b border-white/5 bg-black pb-3 pt-3 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-apois-yellow">APOIS</p>
          <h1 className="mt-1 text-xl font-black">
            {screenState === "completed" ? "Corrida finalizada" : "Corrida encerrada"}
          </h1>
        </header>

        <div className="app-scroll flex-1 space-y-3 px-4 py-4">
          <section className="h-[210px] overflow-hidden rounded-[26px] border border-white/8 bg-zinc-900">
            <ActiveRideMap ride={ride} />
          </section>

          <section className="rounded-3xl border border-white/8 bg-[#0e1014] p-4">
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-500">Valor total</p>
            <p className="mt-1 text-3xl font-black text-apois-yellow">
              R$ {(ride.final_price ?? ride.estimated_price).toFixed(2).replace(".", ",")}
            </p>
          </section>

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
                void navigate({ to: "/corridas/$rideId", params: { rideId: ride.id } });
              }}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-apois-yellow font-black text-black"
            >
              <FileText size={18} />
              Ver comprovante e detalhes
            </Button>
          ) : null}

          <Button onClick={handleReturnHome} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white font-black text-black">
            <Home size={18} />
            Voltar ao início
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-screen min-h-0 bg-black text-white">
      <div className="relative min-h-[320px] flex-1">
        <ActiveRideMap ride={ride} />
        <div className="absolute inset-x-4 top-5 rounded-2xl border border-apois-yellow/20 bg-black/85 p-4 backdrop-blur-xl">
          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-apois-yellow">
            {isQueuedRide ? "Motorista confirmado" : "Corrida programada"}
          </p>
          <p className="mt-2 text-sm font-black">
            {isQueuedRide
              ? "Sua corrida já está reservada. Seu motorista está finalizando uma viagem próxima."
              : "Acompanhe aqui quando a corrida ficar disponível."}
          </p>
        </div>
      </div>
      <div className="shrink-0 space-y-3 rounded-t-[28px] border-t border-white/8 bg-[#0e1014] p-5">
        {isQueuedRide ? (
          <>
            <DriverCard ride={ride} />
            <VehicleCard ride={ride} />
          </>
        ) : null}
        <button
          type="button"
          onClick={() => void refreshRide()}
          disabled={isRefreshing}
          className="app-pressable flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] text-xs font-black text-zinc-300"
        >
          <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
          Atualizar corrida
        </button>
      </div>
    </div>
  );
}
